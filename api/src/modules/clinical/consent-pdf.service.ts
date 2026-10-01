import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { createWriteStream, mkdirSync } from 'fs';
import * as path from 'path';
// pdfmake CJS — tipado laxo por incompatibilidad ESM/CJS de @types/pdfmake
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake') as new (fonts: Record<string, unknown>) => {
  createPdfKitDocument: (doc: unknown) => NodeJS.ReadableStream & {
    pipe: (s: NodeJS.WritableStream) => void;
    end: () => void;
  };
};
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { ClinicalStorageService } from './clinical-storage.service';
import { ConsentPdfInput, buildConsentDocument } from './consent-pdf.document';
import {
  ConsentRevocationPdfInput,
  buildRevocationDocument,
} from './consent-revocation.document';

export type { ConsentPdfInput } from './consent-pdf.document';

export type ConsentPdfResult = {
  pdfStorageKey: string;
  absolutePath: string;
  contentHash: string;
  immutableAt: Date;
};

function sha256(parts: string[]) {
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

function asDataUrl(value: string) {
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
}

@Injectable()
export class ConsentPdfService {
  private readonly logger = new Logger(ConsentPdfService.name);
  private readonly printer: InstanceType<typeof PdfPrinter>;

  constructor(
    private readonly config: ConfigService,
    private readonly storage: ClinicalStorageService,
  ) {
    // Fuentes estándar PDF (sin TTF embebidos) — pdfmake 0.2.x
    this.printer = new PdfPrinter({
      Helvetica: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
    });
  }

  storageRoot() {
    return (
      this.config.get<string>('STORAGE_ROOT') ||
      path.join(process.cwd(), 'storage')
    );
  }

  resolveAbsolutePath(storageKey: string) {
    return path.join(this.storageRoot(), storageKey);
  }

  async seal(input: ConsentPdfInput): Promise<ConsentPdfResult> {
    const signature = asDataUrl(input.signatureBase64);
    const contentHash = sha256([
      input.consentId,
      input.templateCode,
      String(input.templateVersion),
      input.bodyHtml,
      JSON.stringify(input.procedureDetails ?? null),
      input.signerName,
      input.signerDocument,
      signature,
      input.professionalSignatureBase64 || '',
      input.signedAt.toISOString(),
      input.ipAddress || '',
      input.userAgent || '',
    ]);
    const docDefinition = buildConsentDocument(
      { ...input, signatureBase64: signature },
      contentHash,
    );
    const key = await this.writeAndPersist(
      docDefinition,
      path.join('consents', input.clinicId, `${input.consentId}.pdf`),
    );
    return { ...key, contentHash, immutableAt: new Date() };
  }

  /** PDF independiente de revocatoria: el PDF original sellado no se modifica. */
  async sealRevocation(
    clinicId: string,
    input: ConsentRevocationPdfInput,
  ): Promise<ConsentPdfResult> {
    const signature = asDataUrl(input.signatureBase64);
    const contentHash = sha256([
      input.consentId,
      input.originalHash || '',
      input.reason,
      input.signerName,
      signature,
      input.revokedAt.toISOString(),
      input.ipAddress || '',
      input.userAgent || '',
    ]);
    const docDefinition = buildRevocationDocument(
      { ...input, signatureBase64: signature },
      contentHash,
    );
    const key = await this.writeAndPersist(
      docDefinition,
      path.join('consents', clinicId, `${input.consentId}-revocatoria.pdf`),
    );
    return { ...key, contentHash, immutableAt: new Date() };
  }

  private async writeAndPersist(docDefinition: TDocumentDefinitions, relativeKey: string) {
    const absolutePath = this.resolveAbsolutePath(relativeKey);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    await this.writePdf(docDefinition, absolutePath);
    const pdfStorageKey = relativeKey.replace(/\\/g, '/');
    // Fuente de verdad en Postgres (además del espejo en disco).
    await this.storage.persistExisting(pdfStorageKey, 'application/pdf');
    this.logger.log(`PDF sellado y guardado en BD: ${pdfStorageKey}`);
    return { pdfStorageKey, absolutePath };
  }

  private writePdf(
    docDefinition: TDocumentDefinitions,
    absolutePath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
        const stream = createWriteStream(absolutePath);
        pdfDoc.pipe(stream);
        pdfDoc.end();
        stream.on('finish', () => resolve());
        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  async readPdfBuffer(storageKey: string): Promise<Buffer> {
    return this.storage.readBuffer(storageKey);
  }
}
