import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake') as new (fonts: Record<string, unknown>) => {
  createPdfKitDocument: (doc: unknown) => NodeJS.EventEmitter & {
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    end: () => void;
  };
};
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { DEFAULT_PALETTE, type DocumentPalette } from '../../common/logo-palette';

export type ReceiptPdfInput = {
  clinicName: string;
  clinicAddress?: string | null;
  clinicPhone?: string | null;
  clinicNit?: string | null;
  /** Logo propio del consultorio (data URL). Nunca el de HABILISALUD. */
  clinicLogo?: string | null;
  /** Colores del consultorio (sacados de su logo). */
  palette?: DocumentPalette;
  number: string;
  issuedAt: Date;
  patientName: string;
  patientDocument: string;
  patientPhone?: string | null;
  patientEmail?: string | null;
  /** Código del medio de pago (CASH, TRANSFER, CARD, NEQUI…). */
  methodCode: string;
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

const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 36;
const MIN_ROWS = 3;

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
    const pal = input.palette ?? DEFAULT_PALETTE;
    const NAVY = pal.primary;
    const TEAL = pal.accent;
    const LINE = pal.line;
    const SOFT = pal.soft;
    const INK = pal.ink;
    const MUTED = pal.muted;
    const money = (n: number) =>
      `$ ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n)}`;
    const date = input.issuedAt.toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const otherMethod = !['CASH', 'TRANSFER', 'CARD'].includes(input.methodCode);
    const taxRate = input.subtotal > 0 ? Math.round((input.tax / input.subtotal) * 100) : 0;

    const field = (label: string, value: string | null | undefined): Content => ({
      table: {
        widths: ['auto', '*'],
        body: [
          [
            { text: label, color: INK, border: [false, false, false, false] },
            {
              text: value?.trim() || ' ',
              bold: !!value,
              color: INK,
              border: [false, false, false, true],
            },
          ],
        ],
      },
      layout: {
        hLineColor: () => LINE,
        hLineWidth: () => 0.8,
        paddingLeft: (i) => (i === 0 ? 0 : 6),
        paddingRight: () => 0,
        paddingTop: () => 3,
        paddingBottom: () => 2,
      },
      margin: [0, 0, 0, 5],
    });

    const checkbox = (label: string, checked: boolean): Content => ({
      columns: [
        {
          width: 14,
          canvas: [
            { type: 'rect', x: 0, y: 1, w: 10, h: 10, r: 2, lineColor: NAVY, lineWidth: 0.9 },
            ...(checked
              ? [{ type: 'rect' as const, x: 2.5, y: 3.5, w: 5, h: 5, r: 1, color: NAVY }]
              : []),
          ],
        },
        { width: 'auto', text: label, color: INK, bold: checked },
      ],
      columnGap: 4,
    });

    const itemRow = (qty: string, text: string, unit: string, value: string, fill?: string) => [
      { text: qty, alignment: 'center' as const, fillColor: fill, color: INK },
      { text, fillColor: fill, color: INK },
      { text: unit, alignment: 'right' as const, fillColor: fill, color: INK },
      { text: value, alignment: 'right' as const, fillColor: fill, color: INK, bold: !!value },
    ];
    const rows = input.items.map((it, i) =>
      itemRow(String(it.quantity), it.description, money(it.unitPrice), money(it.lineTotal), i % 2 ? SOFT : undefined),
    );
    for (let i = rows.length; i < MIN_ROWS; i += 1) {
      rows.push(itemRow(' ', ' ', '', '', i % 2 ? SOFT : undefined));
    }

    const identity: Content[] = input.clinicLogo
      ? [{ image: input.clinicLogo, fit: [300, 78], absolutePosition: { x: MARGIN, y: 24 } }]
      : [
          {
            text: input.clinicName,
            fontSize: 22,
            bold: true,
            color: NAVY,
            width: 440,
            absolutePosition: { x: MARGIN, y: 36 },
          } as Content,
        ];
    if (input.clinicNit) {
      identity.push({
        text: `NIT ${input.clinicNit}`,
        fontSize: 9,
        color: MUTED,
        absolutePosition: { x: MARGIN, y: 104 },
      });
    }

    const doc: TDocumentDefinitions = {
      pageSize: { width: PAGE_W, height: PAGE_H },
      pageMargins: [MARGIN, 124, MARGIN, 60],
      defaultStyle: { font: 'Helvetica', fontSize: 10, color: INK },
      info: { title: `Recibo de caja ${input.number}` },
      header: () => ({
        stack: [
          {
            canvas: [
              {
                type: 'polyline',
                closePath: true,
                color: NAVY,
                points: [
                  { x: 520, y: 22 },
                  { x: PAGE_W - 22, y: 22 },
                  { x: PAGE_W - 22, y: 96 },
                  { x: PAGE_W - 48, y: 108 },
                  { x: 496, y: 108 },
                ],
              },
              {
                type: 'polyline',
                closePath: true,
                color: TEAL,
                points: [
                  { x: PAGE_W - 22, y: 60 },
                  { x: PAGE_W - 22, y: 96 },
                  { x: PAGE_W - 48, y: 108 },
                  { x: PAGE_W - 70, y: 108 },
                ],
              },
              { type: 'rect', x: 600, y: 70, w: 150, h: 26, r: 6, color: '#ffffff' },
              { type: 'ellipse', x: PAGE_W - 30, y: PAGE_H - 40, r1: 70, r2: 70, lineColor: pal.decor, lineWidth: 14 },
            ],
            absolutePosition: { x: 0, y: 0 },
          } as Content,
          ...identity,
          {
            text: 'RECIBO DE CAJA',
            color: '#ffffff',
            bold: true,
            fontSize: 21,
            alignment: 'center',
            absolutePosition: { x: 520, y: 34 },
            width: PAGE_W - 22 - 520,
          } as Content,
          { text: 'N°', color: '#ffffff', bold: true, fontSize: 16, absolutePosition: { x: 566, y: 74 } },
          {
            text: input.number,
            color: NAVY,
            bold: true,
            fontSize: 14,
            alignment: 'center',
            absolutePosition: { x: 600, y: 76 },
            width: 150,
          } as Content,
        ],
      }),
      content: [
        {
          table: {
            widths: ['*'],
            body: [
              [
                {
                  margin: [10, 8, 10, 4],
                  columns: [
                    {
                      width: '52%',
                      stack: [
                        field('Fecha:', date),
                        field('Paciente:', input.patientName),
                        field('Documento de identidad:', input.patientDocument),
                        field('Teléfono:', input.patientPhone),
                        field('Correo:', input.patientEmail),
                      ],
                    },
                    {
                      width: 1,
                      canvas: [{ type: 'line', x1: 0, y1: 2, x2: 0, y2: 118, lineColor: LINE, lineWidth: 0.8 }],
                    },
                    {
                      width: '*',
                      stack: [
                        {
                          columns: [
                            { width: 'auto', text: 'Medio de pago:', margin: [0, 1, 8, 0] },
                            {
                              width: '*',
                              stack: [
                                {
                                  columns: [
                                    checkbox('Efectivo', input.methodCode === 'CASH'),
                                    checkbox('Transferencia', input.methodCode === 'TRANSFER'),
                                  ],
                                  margin: [0, 0, 0, 6],
                                },
                                {
                                  columns: [
                                    checkbox('Tarjeta', input.methodCode === 'CARD'),
                                    checkbox(otherMethod ? `Otro: ${input.method}` : 'Otro', otherMethod),
                                  ],
                                },
                              ],
                            },
                          ],
                          margin: [0, 0, 0, 8],
                        },
                        field('Consultorio:', input.clinicName),
                        field('Atendido por:', input.createdByName),
                        field('Observación:', input.notes),
                      ],
                    },
                  ],
                  columnGap: 14,
                },
              ],
            ],
          },
          layout: {
            hLineColor: () => LINE,
            vLineColor: () => LINE,
            hLineWidth: () => 1,
            vLineWidth: () => 1,
          },
          margin: [0, 0, 0, 14],
        },
        {
          table: {
            headerRows: 1,
            widths: [60, '*', 110, 130],
            body: [
              [
                { text: 'CANT.', bold: true, color: '#ffffff', fillColor: NAVY, alignment: 'center' },
                { text: 'CONCEPTO', bold: true, color: '#ffffff', fillColor: NAVY, alignment: 'center' },
                { text: 'V. UNITARIO', bold: true, color: '#ffffff', fillColor: NAVY, alignment: 'center' },
                { text: 'VALOR', bold: true, color: '#ffffff', fillColor: NAVY, alignment: 'center' },
              ],
              ...rows,
            ],
          },
          layout: {
            hLineColor: () => LINE,
            vLineColor: () => LINE,
            hLineWidth: () => 0.8,
            vLineWidth: () => 0.8,
            paddingTop: () => 6,
            paddingBottom: () => 6,
          },
          margin: [0, 0, 0, 14],
        },
        {
          unbreakable: true,
          columns: [
            {
              width: 260,
              stack: [
                { text: 'Recibí conforme:', margin: [0, 4, 0, 0] },
                { text: ' ', margin: [0, 0, 0, 34] },
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 260, y2: 0, lineColor: INK, lineWidth: 0.8 }] },
                {
                  text: input.clinicName,
                  fontSize: 8,
                  color: MUTED,
                  margin: [0, 8, 0, 0],
                  alignment: 'center',
                },
              ],
            },
            { width: '*', text: '' },
            {
              width: 270,
              table: {
                widths: ['*', 130],
                body: [
                  [{ text: 'SUBTOTAL', fillColor: SOFT }, { text: money(input.subtotal), alignment: 'right', fillColor: '#ffffff' }],
                  [{ text: `IVA ( ${taxRate} % )`, fillColor: SOFT }, { text: money(input.tax), alignment: 'right', fillColor: '#ffffff' }],
                  [
                    { text: 'TOTAL', bold: true, color: '#ffffff', fillColor: TEAL },
                    { text: money(input.total), bold: true, alignment: 'right', fillColor: '#ffffff' },
                  ],
                ],
              },
              layout: {
                hLineColor: () => LINE,
                vLineColor: () => LINE,
                hLineWidth: () => 0.8,
                vLineWidth: () => 0.8,
                paddingTop: () => 6,
                paddingBottom: () => 6,
              },
            },
          ],
        },
      ],
      footer: () => ({
        margin: [MARGIN, 8, MARGIN, 0],
        stack: [
          {
            text: [input.clinicName, input.clinicAddress, input.clinicPhone].filter(Boolean).join('   |   '),
            alignment: 'center',
            fontSize: 9,
            color: INK,
            margin: [0, 3, 0, 0],
          },
          {
            text: 'Documento de caja interno · No es factura electrónica DIAN',
            alignment: 'center',
            fontSize: 7,
            color: '#94a3b8',
            margin: [0, 6, 0, 0],
          },
        ],
      }),
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
