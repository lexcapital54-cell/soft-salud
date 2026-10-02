import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
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
  issuedAt: Date;
  paidAt: Date | null;
  pending?: boolean;
  clinicName: string;
  payerName?: string | null;
  payerDocument?: string | null;
  payerPhone?: string | null;
  payerEmail?: string | null;
  kindLabel: string;
  planLabel: string;
  description: string;
  amount: number;
  method: string;
  methodLabel: string;
  periodLabel?: string | null;
  notes?: string | null;
  createdByName?: string | null;
};

const NAVY = '#0b4f8a';
const TEAL = '#0d7c8c';
const LINE = '#a9c8e2';
const SOFT = '#eef5fb';
const INK = '#1f3b57';
const MUTED = '#5b7590';

const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 36;

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
  private logo: string | null | undefined;

  async build(input: PlatformReceiptPdfInput): Promise<Buffer> {
    const money = (n: number) =>
      new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
    const date = (input.pending ? input.issuedAt : input.paidAt ?? input.issuedAt)
      .toLocaleDateString('es-CO', {
        timeZone: 'America/Bogota',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    const title = input.pending ? 'CUENTA DE COBRO' : 'RECIBO DE CAJA';
    const logo = this.loadLogo();
    const concept = [
      input.kindLabel,
      input.periodLabel ? `Periodo ${input.periodLabel}` : null,
      `Plan: ${input.planLabel}`,
    ]
      .filter(Boolean)
      .join('\n');
    const paid = !input.pending;
    const otherMethod = paid && !['CASH', 'TRANSFER', 'CARD'].includes(input.method);

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

    const itemRow = (qty: string, text: string, value: string, fill?: string) => [
      { text: qty, alignment: 'center' as const, fillColor: fill, color: INK },
      { text, fillColor: fill, color: INK },
      { text: value, alignment: 'right' as const, fillColor: fill, color: INK, bold: !!value },
    ];

    const doc: TDocumentDefinitions = {
      pageSize: { width: PAGE_W, height: PAGE_H },
      pageMargins: [MARGIN, 124, MARGIN, 60],
      defaultStyle: { font: 'Helvetica', fontSize: 10, color: INK },
      info: { title: `${title} ${input.number}` },
      header: () => ({
        stack: [
          { canvas: [
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
          { type: 'ellipse', x: PAGE_W - 30, y: PAGE_H - 40, r1: 70, r2: 70, lineColor: '#e3eef7', lineWidth: 14 },
        ], absolutePosition: { x: 0, y: 0 } } as Content,
          ...(logo
            ? [{ image: logo, width: 300, absolutePosition: { x: MARGIN, y: 26 } }]
            : [{ text: 'HABILISALUD', fontSize: 26, bold: true, color: NAVY, absolutePosition: { x: MARGIN, y: 40 } }]),
          {
            text: title,
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
                        field(input.pending ? 'Fecha de emisión:' : 'Fecha:', date),
                        field('Nombre:', input.payerName),
                        field('Documento de identidad / NIT:', input.payerDocument),
                        field('Teléfono:', input.payerPhone),
                        field('Consultorio:', input.clinicName),
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
                                  columns: [checkbox('Efectivo', paid && input.method === 'CASH'), checkbox('Transferencia', paid && input.method === 'TRANSFER')],
                                  margin: [0, 0, 0, 6],
                                },
                                {
                                  columns: [
                                    checkbox('Tarjeta', paid && input.method === 'CARD'),
                                    checkbox(otherMethod ? `Otro: ${input.methodLabel}` : 'Otro', otherMethod),
                                  ],
                                },
                              ],
                            },
                          ],
                          margin: [0, 0, 0, 8],
                        },
                        field('Correo:', input.payerEmail),
                        field('Plan a la fecha:', input.planLabel),
                        field('Concepto / Observación:', input.notes || input.description),
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
            widths: [70, '*', 150],
            body: [
              [
                { text: 'CANT.', bold: true, color: '#ffffff', fillColor: NAVY, alignment: 'center' },
                { text: 'CONCEPTO', bold: true, color: '#ffffff', fillColor: NAVY, alignment: 'center' },
                { text: 'VALOR', bold: true, color: '#ffffff', fillColor: NAVY, alignment: 'center' },
              ],
              itemRow('1', concept, `$ ${money(input.amount)}`),
              itemRow(' ', ' ', '', SOFT),
              itemRow(' ', ' ', ''),
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
          columns: [
            {
              width: 260,
              stack: [
                { text: 'Recibí conforme:', margin: [0, 18, 0, 34] },
                { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 260, y2: 0, lineColor: INK, lineWidth: 0.8 }] },
                {
                  text: paid && input.createdByName ? `${input.createdByName} · HabiliSALUD` : 'Firma y nombre',
                  fontSize: 8,
                  color: MUTED,
                  margin: [0, 4, 0, 0],
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
                  [{ text: 'SUBTOTAL', fillColor: SOFT }, { text: `$ ${money(input.amount)}`, alignment: 'right', fillColor: '#ffffff' }],
                  [{ text: 'IVA ( 0 % )', fillColor: SOFT }, { text: '$ 0', alignment: 'right', fillColor: '#ffffff' }],
                  [
                    { text: 'TOTAL', bold: true, color: '#ffffff', fillColor: TEAL },
                    { text: `$ ${money(input.amount)}`, bold: true, alignment: 'right', fillColor: '#ffffff' },
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
        ...(input.pending
          ? [
              {
                text: 'PENDIENTE DE PAGO · La mensualidad se paga dentro de los primeros 5 días del mes.',
                bold: true,
                color: '#9a3412',
                fontSize: 9,
                margin: [0, 10, 0, 0] as [number, number, number, number],
              },
            ]
          : []),
      ],
      footer: () => ({
        margin: [MARGIN, 8, MARGIN, 0],
        stack: [
          {
            columns: [
              { width: 'auto', text: 'Tu salud, nuestra prioridad', italics: true, color: TEAL, fontSize: 13 },
              {
                width: '*',
                text: 'Manizales, Caldas   |   +57 312 663 9980   |   servicioalcliente@habilisalud.com',
                alignment: 'right',
                fontSize: 9,
                color: INK,
                margin: [0, 3, 0, 0],
              },
            ],
          },
          {
            text: 'Documento interno de cobro de plataforma · No es factura electrónica DIAN',
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

  private loadLogo(): string | null {
    if (this.logo !== undefined) return this.logo;
    const candidates = [
      path.join(process.cwd(), 'assets', 'platform', 'habilisalud-logo.jpg'),
      path.join(process.cwd(), 'api', 'assets', 'platform', 'habilisalud-logo.jpg'),
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    this.logo = found ? `data:image/jpeg;base64,${fs.readFileSync(found).toString('base64')}` : null;
    if (!found) this.logger.warn('No se encontró el logo de HabiliSALUD para el recibo');
    return this.logo;
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
