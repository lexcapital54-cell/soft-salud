import { Injectable } from '@nestjs/common';
import { DocumentSignerRole } from '@prisma/client';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake') as new (fonts: Record<string, unknown>) => {
  createPdfKitDocument: (doc: unknown) => NodeJS.ReadableStream & {
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    end: () => void;
  };
};
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

const ROLE_TITLE: Record<DocumentSignerRole, string> = {
  ELABORO: 'Firma Elaboró',
  REVISO: 'Firma Revisó',
  APROBO: 'Firma Aprobó',
  CAPACITADOR: 'Firma Capacitador',
  ASISTENTE: 'Firma Asistente / Evaluado',
};

export type SgsstFillSignature = {
  role: DocumentSignerRole;
  signerName: string;
  signatureBase64: string;
};

export type SgsstFillPdfInput = {
  clinicName: string;
  documentTitle: string;
  documentCode: string;
  fecha: string;
  periodLabel?: string | null;
  contenido?: string | null;
  tema?: string | null;
  objetivo?: string | null;
  signatures: SgsstFillSignature[];
};

/**
 * Genera PDFs diligenciados del SG-SST con firmas imagen pegadas bajo
 * cada etiqueta "Firma …". Cubre actas (Capacitador/Asistente) y el resto
 * de documentos (Elaboró/Revisó/Aprobó).
 */
@Injectable()
export class SgsstFillPdfService {
  private readonly printer = new PdfPrinter({
    Helvetica: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  });

  async build(input: SgsstFillPdfInput): Promise<Buffer> {
    const isTraining = input.signatures.some(
      (s) =>
        s.role === DocumentSignerRole.CAPACITADOR ||
        s.role === DocumentSignerRole.ASISTENTE,
    );

    const dotted = (value: string): Content => ({
      text: value || '…………………………………………………………',
      margin: [0, 2, 0, 10],
    });

    const content: Content[] = [
      {
        text: input.documentTitle.toUpperCase(),
        style: 'title',
        alignment: 'center',
        margin: [0, 0, 0, 4],
      },
      {
        text: input.clinicName,
        alignment: 'center',
        color: '#47656b',
        margin: [0, 0, 0, 4],
      },
      {
        text: `${input.documentCode} · Decreto 1072 de 2015 · Resolución 0312 de 2019`,
        alignment: 'center',
        fontSize: 9,
        color: '#6a8085',
        margin: [0, 0, 0, 18],
      },
    ];

    if (isTraining) {
      content.push(
        { text: 'Tema', style: 'label' },
        dotted(input.tema || input.documentTitle),
      );
    }

    content.push({
      columns: [
        {
          width: '*',
          stack: [{ text: 'Fecha', style: 'label' }, dotted(input.fecha)],
        },
        {
          width: '*',
          stack: [
            { text: 'Periodo', style: 'label' },
            dotted(input.periodLabel || '—'),
          ],
        },
      ],
      columnGap: 16,
    });

    for (const sig of input.signatures) {
      const whoLabel =
        sig.role === DocumentSignerRole.CAPACITADOR
          ? 'Capacitador (quien aprueba la capacitación)'
          : sig.role === DocumentSignerRole.ASISTENTE
            ? 'Persona evaluada / asistente'
            : sig.role === DocumentSignerRole.ELABORO
              ? 'Elaboró'
              : sig.role === DocumentSignerRole.REVISO
                ? 'Revisó'
                : 'Aprobó';
      content.push({ text: whoLabel, style: 'label' }, dotted(sig.signerName));
    }

    if (input.objetivo) {
      content.push(
        { text: 'Objetivo', style: 'label' },
        { text: input.objetivo, margin: [0, 2, 0, 12] },
      );
    }

    content.push(
      { text: 'Contenido / observaciones', style: 'label' },
      {
        text:
          input.contenido?.trim() ||
          '……………………………………………………………………………………\n……………………………………………………………………………………\n……………………………………………………………………………………',
        margin: [0, 2, 0, 18],
      },
      {
        text: 'FIRMAS',
        style: 'section',
        alignment: 'center',
        margin: [0, 10, 0, 16],
      },
    );

    // Firmas en filas de hasta 3 columnas, pegadas bajo "Firma …".
    for (let i = 0; i < input.signatures.length; i += 3) {
      const slice = input.signatures.slice(i, i + 3);
      const columns: Array<{ width: number | '*'; stack?: Content[]; text?: string }> =
        [];
      slice.forEach((sig, idx) => {
        if (idx > 0) columns.push({ width: 16, text: '' });
        columns.push({
          width: '*',
          stack: this.signatureBlock(
            ROLE_TITLE[sig.role],
            sig.signerName,
            this.toDataUrl(sig.signatureBase64),
          ),
        });
      });
      content.push({ columns: columns as Content[], margin: [0, 0, 0, 16] });
    }

    content.push({
      text:
        'Documento generado por HABILISALUD. Las firmas imagen quedan incrustadas en este PDF; ' +
        'las versiones anteriores del expediente se conservan en el histórico.',
      fontSize: 8,
      color: '#8f8f8f',
      margin: [0, 24, 0, 0],
    });

    const docDefinition: TDocumentDefinitions = {
      pageSize: 'LETTER',
      pageMargins: [48, 48, 48, 48],
      content,
      styles: {
        title: { fontSize: 13, bold: true, color: '#003d4c' },
        label: {
          fontSize: 9,
          bold: true,
          color: '#0d7377',
          margin: [0, 8, 0, 0],
        },
        section: { fontSize: 11, bold: true, color: '#003d4c' },
      },
      defaultStyle: { font: 'Helvetica', fontSize: 11, color: '#003d4c' },
    };

    return this.render(docDefinition);
  }

  private signatureBlock(
    title: string,
    name: string,
    signatureDataUrl: string,
  ): Content[] {
    return [
      {
        text: title,
        style: 'label',
        alignment: 'center',
        margin: [0, 0, 0, 8],
      },
      {
        image: signatureDataUrl,
        width: 140,
        height: 56,
        alignment: 'center',
        margin: [0, 0, 0, 4],
      },
      {
        canvas: [
          {
            type: 'line',
            x1: 10,
            y1: 0,
            x2: 170,
            y2: 0,
            lineWidth: 0.8,
            lineColor: '#003d4c',
          },
        ],
      },
      {
        text: name,
        alignment: 'center',
        fontSize: 9,
        margin: [0, 6, 0, 0],
      },
      {
        text: '…………………………………………',
        alignment: 'center',
        fontSize: 9,
        color: '#8f8f8f',
      },
    ];
  }

  private toDataUrl(raw: string) {
    const value = raw.trim();
    if (value.startsWith('data:image')) return value;
    return `data:image/png;base64,${value}`;
  }

  private render(docDefinition: TDocumentDefinitions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const pdfDoc = this.printer.createPdfKitDocument(docDefinition);
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (chunk: unknown) => chunks.push(chunk as Buffer));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });
  }
}
