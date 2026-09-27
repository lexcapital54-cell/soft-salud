import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake') as new (fonts: Record<string, unknown>) => {
  createPdfKitDocument: (doc: unknown) => NodeJS.EventEmitter & {
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    end: () => void;
  };
};
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

export type ReceiptPdfInput = {
  clinicName: string;
  clinicAddress?: string | null;
  clinicPhone?: string | null;
  number: string;
  issuedAt: Date;
  patientName: string;
  patientDocument: string;
  method: string;
  notes?: string | null;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
  createdByName?: string | null;
};

@Injectable()
export class ReceiptPdfService {
  private readonly logger = new Logger(ReceiptPdfService.name);
  private readonly printer = new PdfPrinter({
    Helvetica: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  });

  async build(input: ReceiptPdfInput): Promise<Buffer> {
    const fmt = (n: number) =>
      new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(n);
    const date = input.issuedAt.toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const doc: TDocumentDefinitions = {
      pageSize: 'LETTER',
      pageMargins: [48, 48, 48, 48],
      defaultStyle: { font: 'Helvetica', fontSize: 10, color: '#1a1a1a' },
      content: [
        {
          text: 'RECIBO DE CAJA',
          fontSize: 16,
          bold: true,
          color: '#003d4c',
          alignment: 'center',
          margin: [0, 0, 0, 4],
        },
        {
          text: input.clinicName,
          alignment: 'center',
          color: '#0d7377',
          margin: [0, 0, 0, 2],
        },
        {
          text: [input.clinicAddress, input.clinicPhone].filter(Boolean).join(' · ') || ' ',
          alignment: 'center',
          fontSize: 8,
          color: '#64748b',
          margin: [0, 0, 0, 12],
        },
        {
          columns: [
            { text: [{ text: 'Número: ', bold: true }, input.number] },
            { text: [{ text: 'Fecha: ', bold: true }, date], alignment: 'right' },
          ],
          margin: [0, 0, 0, 8],
        },
        {
          text: [
            { text: 'Paciente: ', bold: true },
            input.patientName,
            '\n',
            { text: 'Documento: ', bold: true },
            input.patientDocument,
            '\n',
            { text: 'Forma de pago: ', bold: true },
            input.method,
          ],
          margin: [0, 0, 0, 12],
        },
        {
          table: {
            widths: ['*', 40, 70, 80],
            body: [
              [
                { text: 'Descripción', bold: true, fillColor: '#e8f6f6' },
                { text: 'Cant.', bold: true, fillColor: '#e8f6f6', alignment: 'right' as const },
                { text: 'V. unit.', bold: true, fillColor: '#e8f6f6', alignment: 'right' as const },
                { text: 'Total', bold: true, fillColor: '#e8f6f6', alignment: 'right' as const },
              ],
              ...input.items.map((it) => [
                it.description,
                { text: String(it.quantity), alignment: 'right' as const },
                { text: fmt(it.unitPrice), alignment: 'right' as const },
                { text: fmt(it.lineTotal), alignment: 'right' as const },
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 10],
        } as Content,
        {
          columns: [
            { text: '' },
            {
              width: 200,
              stack: [
                {
                  columns: [
                    { text: 'Subtotal', alignment: 'left' },
                    { text: fmt(input.subtotal), alignment: 'right' },
                  ],
                },
                {
                  columns: [
                    { text: 'Impuesto', alignment: 'left' },
                    { text: fmt(input.tax), alignment: 'right' },
                  ],
                },
                {
                  columns: [
                    { text: 'TOTAL', bold: true, alignment: 'left' },
                    { text: fmt(input.total), bold: true, alignment: 'right' },
                  ],
                  margin: [0, 4, 0, 0],
                },
              ],
            },
          ],
        },
        ...(input.notes
          ? [
              {
                text: [{ text: 'Notas: ', bold: true }, input.notes],
                margin: [0, 16, 0, 0] as [number, number, number, number],
                fontSize: 9,
                color: '#64748b',
              },
            ]
          : []),
        {
          text: input.createdByName
            ? `Registrado por: ${input.createdByName}`
            : ' ',
          margin: [0, 28, 0, 0],
          fontSize: 9,
          color: '#64748b',
        },
        {
          text: 'Documento de caja interno · No es factura electrónica DIAN',
          margin: [0, 8, 0, 0],
          fontSize: 8,
          color: '#94a3b8',
          alignment: 'center',
        },
      ],
    };

    return this.render(doc);
  }

  private render(doc: TDocumentDefinitions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const chunks: Buffer[] = [];
        const pdf = this.printer.createPdfKitDocument(doc);
        pdf.on('data', (c: Buffer) => chunks.push(c));
        pdf.on('end', () => resolve(Buffer.concat(chunks)));
        pdf.on('error', (err: Error) => reject(err));
        pdf.end();
      } catch (error) {
        this.logger.error('Error generando PDF de recibo', error);
        reject(error);
      }
    });
  }
}
