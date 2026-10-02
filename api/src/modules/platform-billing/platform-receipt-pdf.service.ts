import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake') as new (fonts: Record<string, unknown>) => {
  createPdfKitDocument: (doc: unknown) => NodeJS.EventEmitter & {
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    end: () => void;
  };
};
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';

export type PlatformReceiptPdfInput = {
  number: string;
  paidAt: Date | null;
  pending?: boolean;
  clinicName: string;
  kindLabel: string;
  planLabel: string;
  description: string;
  amount: number;
  method: string;
  periodLabel?: string | null;
  notes?: string | null;
  createdByName?: string | null;
};

@Injectable()
export class PlatformReceiptPdfService {
  private readonly logger = new Logger(PlatformReceiptPdfService.name);
  private readonly printer = new PdfPrinter({
    Helvetica: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  });

  async build(input: PlatformReceiptPdfInput): Promise<Buffer> {
    const fmt = (n: number) =>
      new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0,
      }).format(n);
    const date = input.paidAt
      ? input.paidAt.toLocaleString('es-CO', {
          timeZone: 'America/Bogota',
          dateStyle: 'medium',
          timeStyle: 'short',
        })
      : 'Pendiente de pago';

    const doc: TDocumentDefinitions = {
      pageSize: 'LETTER',
      pageMargins: [48, 48, 48, 48],
      defaultStyle: { font: 'Helvetica', fontSize: 10, color: '#1a1a1a' },
      content: [
        {
          text: input.pending
            ? 'CUENTA DE COBRO (PENDIENTE) — HabiliSALUD'
            : 'RECIBO DE COBRO — HabiliSALUD',
          fontSize: 16,
          bold: true,
          color: '#003d4c',
          alignment: 'center',
          margin: [0, 0, 0, 4],
        },
        {
          text: 'Plataforma de habilitación y software clínico',
          alignment: 'center',
          color: '#0d7377',
          margin: [0, 0, 0, 16],
        },
        {
          columns: [
            { text: [{ text: 'Número: ', bold: true }, input.number] },
            { text: [{ text: 'Fecha: ', bold: true }, date], alignment: 'right' },
          ],
          margin: [0, 0, 0, 10],
        },
        {
          text: [
            { text: 'Consultorio: ', bold: true },
            input.clinicName,
            '\n',
            { text: 'Concepto: ', bold: true },
            input.kindLabel,
            '\n',
            { text: 'Plan: ', bold: true },
            input.planLabel,
            '\n',
            { text: 'Detalle: ', bold: true },
            input.description,
            ...(input.periodLabel
              ? (['\n', { text: 'Periodo: ', bold: true }, input.periodLabel] as const)
              : []),
            '\n',
            { text: 'Forma de pago: ', bold: true },
            input.method,
          ],
          margin: [0, 0, 0, 16],
        },
        {
          table: {
            widths: ['*', 120],
            body: [
              [
                { text: 'Total cobrado', bold: true, fillColor: '#e8f6f6' },
                {
                  text: fmt(input.amount),
                  bold: true,
                  fillColor: '#e8f6f6',
                  alignment: 'right' as const,
                },
              ],
            ],
          },
          layout: 'lightHorizontalLines',
          margin: [0, 0, 0, 12],
        } as Content,
        ...(input.notes
          ? [
              {
                text: [{ text: 'Notas: ', bold: true }, input.notes],
                margin: [0, 8, 0, 0] as [number, number, number, number],
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
          text: 'Documento interno de cobro de plataforma · No es factura electrónica DIAN',
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
        this.logger.error('Error generando PDF de cobro plataforma', error);
        reject(error);
      }
    });
  }
}
