import type { Content, ContentCanvas, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import type { PsychReportData } from './psych-report.dto';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake') as new (fonts: Record<string, unknown>) => {
  createPdfKitDocument: (doc: unknown) => NodeJS.EventEmitter & { end: () => void };
};

const NAVY = '#062540';
const GOLD = '#C99A2E';
const BOX = '#2E4A70';
const INK = '#1B2433';
const MUTED = '#5B6472';

const PAGE_W = 595.28;
const MARGIN_X = 40;
const MARGIN_TOP = 64;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

export const PSYCH_REPORT_FOOTER = 'Documento confidencial · Uso según finalidad autorizada';

const printer = new PdfPrinter({
  Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
  Times: { normal: 'Times-Roman', bold: 'Times-Bold', italics: 'Times-Italic', bolditalics: 'Times-BoldItalic' },
});

const datePieces = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  return m ? { d: m[3], m: m[2], y: m[1] } : { d: '', m: '', y: '' };
};

/** AAAA-MM-DD → DD/MM/AAAA (vacío se conserva vacío). */
export function fmtReportDate(v: string): string {
  const p = datePieces(v);
  return p.y ? `${p.d}/${p.m}/${p.y}` : '';
}

/** Casilla blanca de borde azul fino. `minHeight` deja espacio para escribir a mano si está vacía. */
function box(value: string, opts: { minHeight?: number; fontSize?: number; align?: 'left' | 'center' } = {}): Content {
  const text = (value || '').trim();
  return {
    table: {
      widths: ['*'],
      heights: opts.minHeight && !text ? [opts.minHeight] : undefined,
      body: [[{ text: text || ' ', fontSize: opts.fontSize ?? 11.5, color: INK, alignment: opts.align ?? 'left', margin: [5, 4, 5, 3], lineHeight: 1.25 }]],
    },
    layout: {
      hLineWidth: () => 0.7,
      vLineWidth: () => 0.7,
      hLineColor: () => BOX,
      vLineColor: () => BOX,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  } as Content;
}

function labeled(label: string, value: string, width: number | string): Content {
  return {
    width,
    stack: [{ text: label, font: 'Times', fontSize: 11.5, color: INK, margin: [2, 0, 0, 2] }, box(value)],
  } as Content;
}

/** Etiqueta de sección: número en círculo y cinta azul marino con borde dorado, como en el formato impreso. */
function sectionHeader(no: number, title: string): Content {
  const label = `•  ${title.toUpperCase()}`;
  const pillEnd = 44 + label.length * 7.5;
  const H = 26;
  const mid = H / 2;
  const tip = 11;
  // Sin polígonos: pdfmake 0.2 no restaura sus puntos al volver a maquetar y la figura se desplaza.
  const tipFill = Array.from({ length: tip * 2 }, (_, i) => {
    const dx = i / 2;
    const dy = ((mid - 1) * dx) / tip;
    return { type: 'line', x1: pillEnd + dx, y1: 1 + dy, x2: pillEnd + dx, y2: H - 1 - dy, lineWidth: 0.8, lineColor: NAVY };
  });
  const shape = [
    { type: 'rect', x: 14, y: 1, w: pillEnd - 14, h: H - 2, color: NAVY },
    ...tipFill,
    { type: 'line', x1: 14, y1: 1, x2: pillEnd, y2: 1, lineWidth: 1, lineColor: GOLD },
    { type: 'line', x1: 14, y1: H - 1, x2: pillEnd, y2: H - 1, lineWidth: 1, lineColor: GOLD },
    { type: 'line', x1: pillEnd, y1: 1, x2: pillEnd + tip, y2: mid, lineWidth: 1, lineColor: GOLD, lineCap: 'round' },
    { type: 'line', x1: pillEnd + tip, y1: mid, x2: pillEnd, y2: H - 1, lineWidth: 1, lineColor: GOLD, lineCap: 'round' },
    { type: 'ellipse', x: mid, y: mid, r1: mid - 0.5, r2: mid - 0.5, color: NAVY, lineColor: GOLD, lineWidth: 1.2 },
    { type: 'line', x1: pillEnd + tip + 4, y1: mid, x2: CONTENT_W - 4, y2: mid, lineWidth: 0.8, lineColor: GOLD },
    { type: 'ellipse', x: CONTENT_W - 3, y: mid, r1: 2.2, r2: 2.2, color: GOLD },
  ] as ContentCanvas['canvas'];
  // El texto se superpone a la figura sin ocupar espacio propio en el flujo.
  return {
    headlineLevel: 1,
    margin: [0, 10, 0, 7],
    stack: [
      { canvas: shape },
      { text: String(no).padStart(2, '0'), font: 'Times', bold: true, fontSize: 12.5, color: GOLD, relativePosition: { x: no < 10 ? 6.2 : 6, y: -(H - 6) } },
      { text: label, font: 'Times', bold: true, fontSize: 11, color: GOLD, characterSpacing: 0.9, relativePosition: { x: H + 8, y: -(H - 7) } },
    ],
  } as Content;
}

function textSection(no: number, title: string, value: string): Content[] {
  const text = (value || '').trim();
  if (!text) return [sectionHeader(no, title), box('', { minHeight: 46 })];
  // La fila de cabecera vacía se repite en cada hoja: el texto que continúa no queda pegado al borde.
  return [
    sectionHeader(no, title),
    {
      table: {
        widths: ['*'],
        headerRows: 1,
        body: [[{ text: '', fontSize: 1, margin: [0, 3, 0, 0] }], [{ text, color: INK, margin: [5, 1, 5, 3], lineHeight: 1.25 }]],
      },
      layout: {
        hLineWidth: (i: number) => (i === 1 ? 0 : 0.7),
        vLineWidth: () => 0.7,
        hLineColor: () => BOX,
        vLineColor: () => BOX,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
    } as Content,
  ];
}

export function psychReportDefinition(data: PsychReportData, logo: string | null, signature: string | null): TDocumentDefinitions {
  const clinicName = (data.clinicName || '').trim() || 'Consultorio';
  const p = data.patient;
  const pro = data.professional;
  const issued = datePieces(data.issuedAt);

  const goldRule = (w: number): Content => ({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: w, y2: 0, lineWidth: 0.8, lineColor: GOLD }] });

  const brand: Content = {
    stack: [
      { text: clinicName.toUpperCase(), font: 'Times', fontSize: clinicName.length > 36 ? 12.5 : 15, color: GOLD, alignment: 'center', characterSpacing: 1.4 },
      {
        margin: [0, 6, 0, 0],
        columns: [
          { width: '*', stack: [{ ...(goldRule(70) as object), alignment: 'right', margin: [0, 5, 0, 0] } as Content] },
          { width: 'auto', text: 'PSICOLOGÍA', font: 'Times', fontSize: 10, color: GOLD, characterSpacing: 3.2, margin: [10, 0, 10, 0] },
          { width: '*', stack: [{ ...(goldRule(70) as object), margin: [0, 5, 0, 0] } as Content] },
        ],
      },
    ],
  };
  const header: Content = {
    margin: [0, -(MARGIN_TOP - 30), 0, 0],
    table: {
      widths: logo ? [92, '*'] : ['*'],
      body: [
        logo
          ? [{ image: logo, fit: [76, 46], alignment: 'center', margin: [0, 2, 0, 2] } as TableCell, { ...brand, margin: [0, 6, 0, 4] } as TableCell]
          : [{ ...brand, margin: [0, 6, 0, 4] } as TableCell],
      ],
    },
    layout: {
      fillColor: () => NAVY,
      hLineWidth: () => 1.4,
      vLineWidth: (i: number) => (i === 0 || i === (logo ? 2 : 1) ? 1.4 : 0.8),
      hLineColor: () => GOLD,
      vLineColor: () => GOLD,
      paddingLeft: () => 10,
      paddingRight: () => 10,
      paddingTop: () => 8,
      paddingBottom: () => 8,
    },
  } as Content;

  const titleSide = (CONTENT_W - 300) / 2 - 10;
  // pdfmake modifica los nodos al maquetar: cada lado necesita su propio objeto.
  const doubleRule = (): Content => ({
    canvas: [
      { type: 'line', x1: 0, y1: 9, x2: titleSide, y2: 9, lineWidth: 0.8, lineColor: GOLD },
      { type: 'line', x1: 0, y1: 12, x2: titleSide, y2: 12, lineWidth: 0.8, lineColor: GOLD },
    ],
  });
  const title: Content = {
    margin: [0, 12, 0, 8],
    columns: [
      { width: '*', stack: [doubleRule()] },
      { width: 'auto', text: 'INFORME PSICOLÓGICO', font: 'Times', bold: true, fontSize: 23, color: NAVY, characterSpacing: 0.5, margin: [10, 0, 10, 0] },
      { width: '*', stack: [doubleRule()] },
    ],
  };

  const small = (v: string, w: number): Content => ({ width: w, stack: [box(v, { align: 'center' })] }) as Content;
  const slash = (): Content => ({ width: 12, text: '/', alignment: 'center', fontSize: 13, color: INK, margin: [0, 3, 0, 0] }) as Content;
  const meta: Content = {
    margin: [0, 0, 0, 2],
    columns: [
      { width: 'auto', text: 'N.º de informe:', font: 'Times', fontSize: 12.5, color: INK, margin: [0, 4, 6, 0] },
      { width: 170, stack: [box(data.reportNumber)] },
      { width: '*', text: '' },
      { width: 'auto', text: 'Fecha:', font: 'Times', fontSize: 12.5, color: INK, margin: [0, 4, 6, 0] },
      small(issued.d, 32),
      slash(),
      small(issued.m, 32),
      slash(),
      small(issued.y, 52),
    ],
  };

  const gap = 12;
  const identification: Content = {
    stack: [
      sectionHeader(1, 'Identificación del paciente'),
      { columns: [labeled('Nombres y apellidos', p.fullName, '*')] },
      {
        margin: [0, 5, 0, 0],
        columnGap: gap,
        columns: [labeled('Tipo de documento', p.documentType, '34%'), labeled('Número de documento', p.documentNumber, '*'), labeled('Edad', p.age, 92)],
      },
      { margin: [0, 5, 0, 0], columnGap: gap, columns: [labeled('Fecha de nacimiento', fmtReportDate(p.birthDate), '50%'), labeled('Teléfono', p.phone, '*')] },
      { margin: [0, 5, 0, 0], columns: [labeled('Institución / entidad solicitante', p.institution, '*')] },
    ],
  };

  const lineW = 210;
  const signatureBlock: Content = {
    unbreakable: true,
    stack: [
      sectionHeader(5, 'Profesional responsable'),
      signature
        ? { image: signature, fit: [190, 50], alignment: 'center', margin: [0, 0, 0, 0] }
        : { text: ' ', margin: [0, 0, 0, 30] },
      { canvas: [{ type: 'line', x1: (CONTENT_W - lineW) / 2, y1: 2, x2: (CONTENT_W + lineW) / 2, y2: 2, lineWidth: 0.9, lineColor: BOX }] },
      { text: 'Firma del profesional', font: 'Times', fontSize: 11.5, alignment: 'center', color: INK, margin: [0, 3, 0, 6] },
      {
        columnGap: gap,
        columns: [labeled('Nombre completo', pro.fullName, '34%'), labeled('Título profesional', pro.title, '*'), labeled('Tarjeta profesional / registro', pro.card, '33%')],
      },
    ],
  };

  const compactHeader = (page: number): Content | null =>
    page === 1
      ? null
      : ({
          margin: [MARGIN_X, 28, MARGIN_X, 0],
          table: {
            widths: ['auto', '*'],
            body: [
              [
                {
                  text: `INFORME PSICOLÓGICO${data.reportNumber ? `  ·  N.º ${data.reportNumber}` : ''}`,
                  font: 'Times',
                  bold: true,
                  fontSize: 9,
                  color: '#FFFFFF',
                  characterSpacing: 0.6,
                },
                { text: p.fullName || clinicName, font: 'Times', fontSize: 9, color: GOLD, alignment: 'right', characterSpacing: 0.4, maxHeight: 12 },
              ],
            ],
          },
          layout: {
            fillColor: () => NAVY,
            hLineWidth: () => 1,
            vLineWidth: (i: number) => (i === 1 ? 0 : 1),
            hLineColor: () => GOLD,
            vLineColor: () => GOLD,
            paddingLeft: () => 9,
            paddingRight: () => 9,
            paddingTop: () => 5,
            paddingBottom: () => 4,
          },
        } as Content);

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [MARGIN_X, MARGIN_TOP, MARGIN_X, 50],
    info: { title: `Informe psicológico${p.fullName ? ` — ${p.fullName}` : ''}`, author: clinicName, subject: 'Informe psicológico' },
    defaultStyle: { font: 'Helvetica', fontSize: 11.5, color: INK, lineHeight: 1.1 },
    background: (_page, size) => ({
      canvas: [
        { type: 'rect', x: 14, y: 14, w: size.width - 28, h: size.height - 28, lineWidth: 1.6, lineColor: GOLD },
        { type: 'rect', x: 19, y: 19, w: size.width - 38, h: size.height - 38, lineWidth: 0.6, lineColor: GOLD },
      ],
    }),
    header: (page: number) => compactHeader(page) as Content,
    footer: (page: number, pages: number): Content => ({
      margin: [MARGIN_X, 10, MARGIN_X, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.7, lineColor: GOLD }] },
        {
          columns: [
            { width: 70, text: '' },
            { width: '*', text: PSYCH_REPORT_FOOTER, font: 'Times', fontSize: 8.5, color: NAVY, alignment: 'center', margin: [0, 5, 0, 0] },
            { width: 70, text: pages > 1 ? `Página ${page} de ${pages}` : '', fontSize: 7.5, color: MUTED, alignment: 'right', margin: [0, 6, 0, 0] },
          ],
        },
      ],
    }),
    // Un título de sección nunca queda solo al final de la hoja: pasa a la siguiente con su contenido.
    pageBreakBefore: ((node: unknown, following: unknown[]) => {
      const n = node as { headlineLevel?: number; startPosition: { verticalRatio: number } };
      return n.headlineLevel === 1 && (n.startPosition.verticalRatio > 0.9 || following.length === 0);
    }) as unknown as TDocumentDefinitions['pageBreakBefore'],
    content: [
      header,
      title,
      meta,
      identification,
      ...textSection(2, 'Motivo y objetivo del informe', data.reason),
      ...textSection(3, 'Evaluación y hallazgos', data.findings),
      ...textSection(4, 'Conclusiones y recomendaciones', data.conclusions),
      signatureBlock,
    ],
  };
}

export function renderPsychReportPdf(data: PsychReportData, logo: string | null, signature: string | null): Promise<Buffer> {
  const doc = printer.createPdfKitDocument(psychReportDefinition(data, logo, signature));
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
