import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
// pdfmake CJS — tipado laxo por incompatibilidad ESM/CJS de @types/pdfmake
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake') as new (fonts: Record<string, unknown>) => {
  createPdfKitDocument: (doc: unknown) => NodeJS.ReadableStream & {
    pipe: (s: NodeJS.WritableStream) => void;
    end: () => void;
  };
};
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

export type ConsentPdfInput = {
  consentId: string;
  clinicId: string;
  clinicName: string;
  clinicAddress?: string | null;
  clinicPhone?: string | null;
  templateCode: string;
  templateTitle: string;
  templateVersion: number;
  /** HTML ya diligenciado (placeholders rellenados) que el paciente aceptó. */
  bodyHtml: string;
  patientName: string;
  patientDocument: string;
  patientDocumentType: string;
  signerName: string;
  signerDocument: string;
  signatureBase64: string;
  signedAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  encounterId?: string | null;
  professionalName?: string | null;
  professionalCard?: string | null;
};

export type ConsentPdfResult = {
  pdfStorageKey: string;
  absolutePath: string;
  contentHash: string;
  immutableAt: Date;
};

@Injectable()
export class ConsentPdfService {
  private readonly logger = new Logger(ConsentPdfService.name);
  private readonly printer: InstanceType<typeof PdfPrinter>;

  constructor(private readonly config: ConfigService) {
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
    const relativeKey = path.join(
      'consents',
      input.clinicId,
      `${input.consentId}.pdf`,
    );
    const absolutePath = this.resolveAbsolutePath(relativeKey);
    mkdirSync(path.dirname(absolutePath), { recursive: true });

    const bodyBlocks = this.htmlToPdfContent(input.bodyHtml);
    const signatureDataUrl = input.signatureBase64.startsWith('data:')
      ? input.signatureBase64
      : `data:image/png;base64,${input.signatureBase64}`;

    const signedAtIso = input.signedAt.toISOString();
    const signedAtLocal = input.signedAt.toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'full',
      timeStyle: 'medium',
    });

    const hashPayload = [
      input.consentId,
      input.templateCode,
      String(input.templateVersion),
      input.bodyHtml,
      input.signerName,
      input.signerDocument,
      signatureDataUrl.slice(0, 128),
      signedAtIso,
      input.ipAddress || '',
    ].join('|');
    const contentHash = createHash('sha256').update(hashPayload).digest('hex');

    const docDefinition: TDocumentDefinitions = {
      pageMargins: [48, 56, 48, 56],
      defaultStyle: {
        font: 'Helvetica',
        fontSize: 10,
        lineHeight: 1.35,
        color: '#1f2937',
      },
      content: [
        {
          columns: [
            {
              width: '*',
              stack: [
                {
                  text: 'HABILISALUD',
                  style: 'brand',
                },
                {
                  text: input.clinicName,
                  style: 'clinicName',
                },
                {
                  text: [input.clinicAddress, input.clinicPhone]
                    .filter(Boolean)
                    .join(' · '),
                  style: 'muted',
                  margin: [0, 2, 0, 0],
                },
              ],
            },
            {
              width: 'auto',
              alignment: 'right',
              stack: [
                { text: 'DOCUMENTO SELLADO', style: 'sealBadge' },
                { text: `Código ${input.templateCode}`, style: 'muted' },
                { text: `Versión ${input.templateVersion}`, style: 'muted' },
              ],
            },
          ],
        },
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: 500,
              y2: 0,
              lineWidth: 1,
              lineColor: '#0D7377',
            },
          ],
          margin: [0, 12, 0, 16],
        },
        { text: input.templateTitle, style: 'title' },
        {
          text: 'Datos del paciente y firmante',
          style: 'section',
          margin: [0, 14, 0, 6],
        },
        {
          table: {
            widths: ['35%', '65%'],
            body: [
              ['Paciente', input.patientName],
              [
                'Documento paciente',
                `${input.patientDocumentType} ${input.patientDocument}`,
              ],
              ['Firmante', input.signerName],
              ['Documento firmante', input.signerDocument],
              [
                'Profesional tratante',
                input.professionalName
                  ? `${input.professionalName}${
                      input.professionalCard
                        ? ` · TP ${input.professionalCard}`
                        : ''
                    }`
                  : 'N/A',
              ],
              ['Atención (encounter)', input.encounterId || 'N/A'],
            ],
          },
          layout: {
            hLineColor: () => '#e5e7eb',
            vLineColor: () => '#e5e7eb',
            paddingLeft: () => 6,
            paddingRight: () => 6,
            paddingTop: () => 4,
            paddingBottom: () => 4,
          },
          margin: [0, 0, 0, 12],
        },
        {
          text: 'Texto legal aceptado',
          style: 'section',
          margin: [0, 4, 0, 8],
        },
        ...bodyBlocks,
        {
          text: 'Firma biométrica del titular / representante',
          style: 'section',
          margin: [0, 18, 0, 8],
        },
        {
          image: signatureDataUrl,
          width: 220,
          height: 90,
          margin: [0, 0, 0, 6],
        },
        {
          canvas: [
            {
              type: 'line',
              x1: 0,
              y1: 0,
              x2: 220,
              y2: 0,
              lineWidth: 0.8,
              lineColor: '#9ca3af',
            },
          ],
        },
        {
          text: `${input.signerName} · Doc. ${input.signerDocument}`,
          style: 'muted',
          margin: [0, 4, 0, 0],
        },
        {
          text: 'Sello de tiempo y trazabilidad',
          style: 'section',
          margin: [0, 18, 0, 6],
        },
        {
          ul: [
            `Fecha/hora (America/Bogota): ${signedAtLocal}`,
            `Timestamp UTC: ${signedAtIso}`,
            `IP de firma: ${input.ipAddress || 'no registrada'}`,
            `User-Agent: ${(input.userAgent || 'no registrado').slice(0, 160)}`,
            `Hash SHA-256 del contenido: ${contentHash}`,
            `ID consentimiento: ${input.consentId}`,
          ],
          style: 'muted',
        },
        {
          text:
            'Documento generado por HABILISALUD. Una vez sellado, el PDF se considera evidencia inalterable del consentimiento informado / autorización de datos. Conservación según normativa clínica vigente.',
          style: 'footerNote',
          margin: [0, 20, 0, 0],
        },
      ],
      styles: {
        brand: {
          fontSize: 16,
          bold: true,
          color: '#003D4C',
          characterSpacing: 0.4,
        },
        clinicName: {
          fontSize: 11,
          color: '#0D7377',
          margin: [0, 2, 0, 0],
        },
        sealBadge: {
          fontSize: 9,
          bold: true,
          color: '#003D4C',
          characterSpacing: 0.6,
        },
        title: {
          fontSize: 13,
          bold: true,
          color: '#003D4C',
          alignment: 'center',
          margin: [0, 0, 0, 4],
        },
        section: {
          fontSize: 11,
          bold: true,
          color: '#0D7377',
        },
        muted: {
          fontSize: 9,
          color: '#6b7280',
        },
        footerNote: {
          fontSize: 8,
          color: '#6b7280',
          italics: true,
        },
        body: {
          fontSize: 10,
          alignment: 'justify',
          margin: [0, 0, 0, 6],
        },
        heading: {
          fontSize: 11,
          bold: true,
          color: '#003D4C',
          margin: [0, 8, 0, 4],
        },
      },
    };

    await this.writePdf(docDefinition, absolutePath);
    this.logger.log(`PDF sellado: ${relativeKey}`);

    return {
      pdfStorageKey: relativeKey.replace(/\\/g, '/'),
      absolutePath,
      contentHash,
      immutableAt: new Date(),
    };
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
    const absolutePath = this.resolveAbsolutePath(storageKey);
    if (!existsSync(absolutePath)) {
      throw new Error(`PDF no encontrado en storage: ${storageKey}`);
    }
    return fs.readFile(absolutePath);
  }

  /** Convierte HTML simple de plantillas a bloques pdfmake. */
  private htmlToPdfContent(html: string): Content[] {
    const normalized = html
      .replace(/<\/(p|div|h1|h2|h3|li|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(ul|ol|table|section|thead|tbody)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<h[1-3][^>]*>/gi, '§ ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);
    return lines.map((line) => {
      if (line.startsWith('§ ')) {
        return { text: line.replace(/^§\s*/, ''), style: 'heading' };
      }
      return { text: line, style: 'body' };
    });
  }
}
