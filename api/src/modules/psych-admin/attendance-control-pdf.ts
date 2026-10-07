import type { Content, ContentCanvas, TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import type { AttendanceControlData } from './attendance-control.dto';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake') as new (fonts: Record<string, unknown>) => {
  createPdfKitDocument: (doc: unknown) => NodeJS.EventEmitter & { end: () => void };
};

const NAVY = '#1F3D47';
const GOLD = '#8A6A55';
// Moca clara de la historia clínica: textos y filetes sobre el fondo petróleo.
const GOLD_ON_NAVY = '#CBB49A';
const CREAM = '#F6F0E9';
const INK = '#1E2A2E';
const RULE = '#5F6B6E';
const MUTED = '#5F6B6E';

const PAGE_W = 595.28;
const MARGIN_X = 40;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

export const ATTENDANCE_FORM_CODE = 'PSI-ADM-01';
export const ATTENDANCE_FORM_VERSION = '01';
export const ATTENDANCE_FOOTER = 'Documento administrativo. No incluir diagnósticos ni contenido de las sesiones.';

const MODALITY_LABEL: Record<string, string> = { PRESENCIAL: 'Presencial', VIRTUAL: 'Virtual' };
const STATUS_LABEL: Record<string, string> = {
  ASIGNADA: 'Asignada',
  ASISTIO: 'Asistió',
  NO_ASISTIO: 'No asistió',
  REPROGRAMADA: 'Reprogramada',
};

const printer = new PdfPrinter({
  Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
  Times: { normal: 'Times-Roman', bold: 'Times-Bold', italics: 'Times-Italic', bolditalics: 'Times-BoldItalic' },
});

/** AAAA-MM-DD → DD/MM/AAAA (vacío se conserva vacío). */
export function fmtDate(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** HH:MM (24 h) → «3:00 p. m.». */
export function fmtTime(v: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(v || '');
  if (!m) return '';
  const h = Number(m[1]);
  const suffix = h < 12 ? 'a. m.' : 'p. m.';
  return `${h % 12 || 12}:${m[2]} ${suffix}`;
}

function sectionHeader(no: number, title: string): Content {
  const label = `·  ${title.toUpperCase()}`;
  const pillW = 46 + label.length * 6.6;
  const lineW = Math.max(40, CONTENT_W - pillW - 10);
  return {
    margin: [0, 12, 0, 6],
    columns: [
      {
        width: pillW,
        table: {
          widths: [24, '*'],
          body: [
            [
              { text: String(no).padStart(2, '0'), font: 'Times', bold: true, fontSize: 12, color: GOLD_ON_NAVY, alignment: 'center', margin: [0, 2, 0, 0] },
              { text: label, bold: true, fontSize: 9, color: '#FFFFFF', characterSpacing: 1.2, margin: [2, 4, 6, 2] },
            ],
          ],
        },
        layout: {
          fillColor: () => NAVY,
          hLineWidth: () => 0.8,
          vLineWidth: (i: number) => (i === 1 ? 0.8 : 0.8),
          hLineColor: () => GOLD_ON_NAVY,
          vLineColor: () => GOLD_ON_NAVY,
          paddingLeft: () => 4,
          paddingRight: () => 4,
          paddingTop: () => 2,
          paddingBottom: () => 2,
        },
      },
      {
        width: '*',
        canvas: [
          { type: 'line', x1: 6, y1: 11, x2: 6 + lineW, y2: 11, lineWidth: 0.7, lineColor: GOLD },
          { type: 'ellipse', x: 6 + lineW, y: 11, r1: 2, r2: 2, color: GOLD },
        ],
      },
    ],
  };
}

/** Etiqueta a la izquierda y valor sobre una línea fina, como en el formato impreso. */
function fieldTable(rows: Array<[string, string]>): Content {
  return {
    table: {
      widths: [138, '*'],
      body: rows.map(([label, value]) => [
        { text: `${label}:`, fontSize: 9.5, color: INK, margin: [0, 5, 0, 1], border: [false, false, false, false] },
        {
          text: value || ' ',
          fontSize: 10,
          color: INK,
          margin: [2, 5, 0, 1],
          border: [false, false, false, true],
          borderColor: ['', '', '', RULE],
        },
      ] as TableCell[]),
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 1,
    },
  };
}

function checkbox(checked: boolean, label: string): Content {
  const box = {
    width: 14,
    canvas: [
      { type: 'rect', x: 0, y: 0, w: 11, h: 11, lineWidth: 0.9, lineColor: GOLD, r: 1.5 },
      ...(checked
        ? ([
            { type: 'line', x1: 2.5, y1: 5.8, x2: 4.8, y2: 8.4, lineWidth: 1.4, lineColor: NAVY },
            { type: 'line', x1: 4.8, y1: 8.4, x2: 8.8, y2: 2.6, lineWidth: 1.4, lineColor: NAVY },
          ] as ContentCanvas['canvas'])
        : []),
    ],
  } as Content;
  return { columns: [box, { text: label, fontSize: 10, margin: [6, 0.5, 0, 0], color: INK }], columnGap: 0, width: 'auto' } as Content;
}

export function attendanceControlDefinition(data: AttendanceControlData, logo: string | null): TDocumentDefinitions {
  const clinicName = (data.clinicName || '').trim() || 'Consultorio';
  const rows = data.rows.length ? data.rows : [];

  const header: Content = {
    table: {
      widths: ['*', 110],
      body: [
        [
          {
            columns: [
              ...(logo ? [{ image: logo, fit: [64, 34] as [number, number], width: 70 }] : []),
              {
                text: clinicName.toUpperCase(),
                font: 'Times',
                fontSize: clinicName.length > 34 ? 11 : 13,
                color: GOLD_ON_NAVY,
                characterSpacing: 1.4,
                margin: [0, logo ? 9 : 4, 0, 0],
              },
            ],
            columnGap: 10,
          },
          {
            stack: [
              { text: 'PSICOLOGÍA', bold: true, fontSize: 9, color: GOLD_ON_NAVY, characterSpacing: 1.6, alignment: 'center', margin: [0, 6, 0, 3] },
              { canvas: [{ type: 'line', x1: 26, y1: 0, x2: 76, y2: 0, lineWidth: 0.7, lineColor: GOLD_ON_NAVY }] },
            ],
          },
        ],
      ],
    },
    layout: {
      fillColor: () => NAVY,
      hLineWidth: () => 1.2,
      vLineWidth: (i: number) => (i === 1 ? 0.8 : 1.2),
      hLineColor: () => GOLD_ON_NAVY,
      vLineColor: () => GOLD_ON_NAVY,
      paddingLeft: () => 14,
      paddingRight: () => 10,
      paddingTop: () => 10,
      paddingBottom: () => 10,
    },
  };

  const subtitleSide = (CONTENT_W - 250) / 2 - 12;
  const subtitle: Content = {
    columns: [
      { width: '*', canvas: [{ type: 'line', x1: 0, y1: 7, x2: subtitleSide, y2: 7, lineWidth: 0.7, lineColor: GOLD }] },
      { width: 'auto', text: 'Asignación de citas y constancia administrativa', fontSize: 10.5, color: NAVY, margin: [8, 0, 8, 0] },
      { width: '*', canvas: [{ type: 'line', x1: 0, y1: 7, x2: subtitleSide, y2: 7, lineWidth: 0.7, lineColor: GOLD }] },
    ],
    margin: [0, 0, 0, 10],
  };

  const meta: Content = {
    table: {
      widths: ['*', '*', '*'],
      body: [
        [
          { text: [{ text: 'Código: ', font: 'Times', bold: true }, ATTENDANCE_FORM_CODE] },
          { text: [{ text: 'Versión: ', font: 'Times', bold: true }, ATTENDANCE_FORM_VERSION] },
          { text: [{ text: 'Fecha de registro: ', font: 'Times', bold: true }, fmtDate(data.registeredAt) || '____ / ____ / ______'] },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.7,
      vLineWidth: () => 0.7,
      hLineColor: () => GOLD,
      vLineColor: () => GOLD,
      paddingLeft: () => 8,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
    fontSize: 9.5,
    color: INK,
  };

  const th = (t: string): TableCell => ({ text: t, font: 'Times', bold: true, fontSize: 10.5, color: NAVY, alignment: 'center', fillColor: CREAM, margin: [0, 2, 0, 2] });
  const td = (t: string): TableCell => ({ text: t || ' ', fontSize: 9.5, color: INK, alignment: 'center', margin: [0, 3, 0, 2] });
  const schedule: Content = {
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: ['*', '*', '*', '*', '*'],
      heights: (i: number) => (i === 0 ? 20 : 19),
      body: [
        [th('Fecha'), th('Hora'), th('Modalidad'), th('Estado'), th('Próxima cita')],
        ...rows.map((r) => [
          td(fmtDate(r.date)),
          td(fmtTime(r.time)),
          td(MODALITY_LABEL[r.modality] || ''),
          td(STATUS_LABEL[r.status] || ''),
          td(fmtDate(r.nextDate)),
        ]),
      ],
    },
    layout: {
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      hLineColor: () => GOLD,
      vLineColor: () => GOLD,
    },
  };

  const legend: Content = {
    margin: [0, 5, 0, 0],
    fontSize: 8.5,
    color: INK,
    text: [
      { text: 'Modalidad: ', bold: true },
      'presencial / virtual.  ',
      { text: 'Estado: ', bold: true },
      'asignada / asistió / no asistió / reprogramada.',
    ],
  };

  const notes = (data.notes || '').trim();
  const ruled = (text: string): TableCell[] => [
    { text: text || ' ', fontSize: 10, color: INK, margin: [0, 4, 0, 1], border: [false, false, false, true], borderColor: ['', '', '', RULE] },
  ];
  const observations: Content = {
    table: {
      widths: ['*'],
      body: notes ? [ruled(notes), ruled('')] : [ruled(''), ruled(''), ruled('')],
    },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 2, paddingBottom: () => 2 },
  };

  const c = data.certificate;
  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [MARGIN_X, 40, MARGIN_X, 52],
    info: { title: `Control de citas y asistencia — ${data.general.userName || 'sin nombre'}`, author: clinicName, subject: ATTENDANCE_FORM_CODE },
    defaultStyle: { font: 'Helvetica', fontSize: 10, color: INK, lineHeight: 1.1 },
    background: (_page, size) => ({
      canvas: [
        { type: 'rect', x: 16, y: 16, w: size.width - 32, h: size.height - 32, lineWidth: 1, lineColor: GOLD },
        { type: 'rect', x: 20, y: 20, w: size.width - 40, h: size.height - 40, lineWidth: 0.4, lineColor: GOLD },
      ],
    }),
    footer: (page: number, pages: number): Content => ({
      margin: [MARGIN_X, 8, MARGIN_X, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: CONTENT_W, y2: 0, lineWidth: 0.6, lineColor: GOLD }] },
        {
          columns: [
            { width: '*', text: ATTENDANCE_FOOTER, fontSize: 7.5, color: MUTED, alignment: 'center', margin: [pages > 1 ? 60 : 0, 5, 0, 0] },
            ...(pages > 1 ? [{ width: 60, text: `Página ${page} de ${pages}`, fontSize: 7.5, color: MUTED, alignment: 'right' as const, margin: [0, 5, 0, 0] }] : []),
          ],
        },
      ],
    }) as Content,
    content: [
      header,
      { text: 'CONTROL DE CITAS Y ASISTENCIA', font: 'Times', bold: true, fontSize: 21, color: NAVY, alignment: 'center', margin: [0, 14, 0, 4], characterSpacing: 0.4 },
      subtitle,
      meta,
      {
        unbreakable: true,
        stack: [
          sectionHeader(1, 'Datos generales'),
          fieldTable([
            ['Nombre del usuario', data.general.userName],
            ['Identificación o código', data.general.identification],
            ['Profesional', data.general.professional],
            ['Consultorio / sede', data.general.site],
          ]),
        ],
      },
      sectionHeader(2, 'Programación y asistencia'),
      schedule,
      legend,
      {
        unbreakable: true,
        stack: [
          sectionHeader(3, 'Constancia'),
          { columns: [checkbox(c.assigned, 'Cita asignada'), checkbox(c.attended, 'Asistencia registrada')], columnGap: 40, margin: [10, 2, 0, 4] },
          fieldTable([
            ['Fecha de la cita', fmtDate(c.date)],
            ['Hora', fmtTime(c.time)],
            ['Lugar o enlace', c.place],
            ['Fecha de emisión', fmtDate(c.issuedAt)],
            ['Responsable del registro', c.responsible],
          ]),
        ],
      },
      { unbreakable: true, stack: [sectionHeader(4, 'Observaciones administrativas'), observations] },
    ],
  };
}

export function renderAttendanceControlPdf(data: AttendanceControlData, logo: string | null): Promise<Buffer> {
  const doc = printer.createPdfKitDocument(attendanceControlDefinition(data, logo));
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
