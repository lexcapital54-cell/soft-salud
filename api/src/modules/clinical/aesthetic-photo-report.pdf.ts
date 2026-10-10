import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import { isoDay, photoAngleLabel, photoMomentLabel, procedureTypeLabel } from './aesthetic-hce.pdf';

/** Orden de los ángulos en el informe (mismo que en la historia). */
const ANGLE_ORDER = ['FRONTAL', 'OBLICUA_DER', 'PERFIL_DER', 'OBLICUA_IZQ', 'PERFIL_IZQ', 'DETALLE'];
const MOMENT_ORDER = ['ANTES', 'CONTROL', 'DESPUES'];
const COLOR = { title: '#0B5563', accent: '#1B998B', muted: '#5B7178', line: '#CBD5E1' };

export interface PhotoReportPhoto {
  id: string;
  angle: string;
  moment: string;
  date: string;
  note: string;
  procedureType: string;
  /** Data URL JPG/PNG; null si el archivo no se pudo leer o no es compatible con PDF. */
  image: string | null;
}

export interface PhotoReportInput {
  provider: { name: string; nit?: string | null; habilitationCode?: string | null; address?: string | null; phone?: string | null };
  patient: { name: string; document: string; age: number | null };
  generatedBy: string;
  generatedAt: Date;
  photos: PhotoReportPhoto[];
  /** Par antes/después elegido en pantalla para el comparativo de portada. */
  compare?: { before: string; after: string } | null;
}

/** JPG o PNG por firma de bytes; pdfmake no admite otros formatos. */
export function imageDataUrl(buffer: Buffer): string | null {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  if (buffer.subarray(0, 4).toString('hex') === '89504e47') return `data:image/png;base64,${buffer.toString('base64')}`;
  return null;
}

const ymd = (v: string) => (/^\d{4}-\d{2}-\d{2}/.exec(v || '') ?? [''])[0];
const day = (v: string) => isoDay(ymd(v)) || 'Sin fecha';

function caption(p: PhotoReportPhoto): string {
  return [photoMomentLabel(p.moment), day(p.date), p.procedureType ? procedureTypeLabel(p.procedureType) : ''].filter(Boolean).join(' · ');
}

function photoCell(p: PhotoReportPhoto | undefined, height: number): Content {
  if (!p) return { text: '' };
  return {
    stack: [
      p.image
        ? { image: p.image, fit: [240, height], alignment: 'center' }
        : {
            text: 'La imagen no está disponible en un formato compatible con PDF (solo JPG o PNG).',
            fontSize: 8,
            italics: true,
            color: COLOR.muted,
            alignment: 'center',
            margin: [0, 30, 0, 30],
          },
      { text: caption(p), fontSize: 8.5, bold: true, color: COLOR.title, alignment: 'center', margin: [0, 4, 0, 0] },
      ...(p.note.trim() ? [{ text: p.note.trim(), fontSize: 8, color: COLOR.muted, alignment: 'center' as const }] : []),
    ],
    unbreakable: true,
    margin: [0, 0, 0, 10],
  };
}

function band(title: string): Content {
  return {
    table: {
      widths: ['*'],
      body: [[{ text: title.toUpperCase(), bold: true, color: '#FFFFFF', fontSize: 9.5, fillColor: COLOR.title, margin: [8, 4, 8, 4] }]],
    },
    layout: 'noBorders',
    margin: [0, 10, 0, 6],
  };
}

function pairs(list: PhotoReportPhoto[], height: number): Content[] {
  const rows: Content[] = [];
  for (let i = 0; i < list.length; i += 2) {
    rows.push({ columns: [photoCell(list[i], height), photoCell(list[i + 1], height)], columnGap: 16 });
  }
  return rows;
}

/** El título de la vista viaja con su primera fila de fotos para no quedar solo al pie de página. */
function section(title: string, rows: Content[]): Content[] {
  const [first, ...rest] = rows;
  return [{ stack: [band(title), ...(first ? [first] : [])], unbreakable: true }, ...rest];
}

/** Fotos ordenadas por ángulo y, dentro de cada ángulo, por fecha y momento. */
export function groupByAngle(photos: PhotoReportPhoto[]) {
  const rank = (list: string[], k: string) => (list.indexOf(k) === -1 ? list.length : list.indexOf(k));
  const sorted = [...photos].sort(
    (a, b) =>
      rank(ANGLE_ORDER, a.angle) - rank(ANGLE_ORDER, b.angle) ||
      ymd(a.date).localeCompare(ymd(b.date)) ||
      rank(MOMENT_ORDER, a.moment) - rank(MOMENT_ORDER, b.moment),
  );
  const groups = new Map<string, PhotoReportPhoto[]>();
  for (const p of sorted) groups.set(p.angle, [...(groups.get(p.angle) ?? []), p]);
  return [...groups.entries()].map(([angle, list]) => ({ angle, list }));
}

export function aestheticPhotoReportDoc(input: PhotoReportInput): TDocumentDefinitions {
  const { provider, patient } = input;
  const habilitation = [
    provider.nit ? `NIT ${provider.nit}` : 'NIT: sin registrar',
    provider.habilitationCode ? `Código de habilitación REPS ${provider.habilitationCode}` : 'Código de habilitación REPS: sin registrar',
  ].join('   ·   ');
  const contact = [provider.address, provider.phone && `Tel. ${provider.phone}`].filter(Boolean).join('   ·   ');
  const generated = input.generatedAt.toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' });

  const byId = new Map(input.photos.map((p) => [p.id, p]));
  const before = input.compare ? byId.get(input.compare.before) : undefined;
  const after = input.compare ? byId.get(input.compare.after) : undefined;

  const body: Content[] = [
    { text: provider.name, fontSize: 15, bold: true, color: COLOR.title, alignment: 'center' },
    { text: habilitation, fontSize: 8.5, color: COLOR.muted, alignment: 'center', margin: [0, 2, 0, 0] },
    ...(contact ? [{ text: contact, fontSize: 8.5, color: COLOR.muted, alignment: 'center' as const }] : []),
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.2, lineColor: COLOR.accent }], margin: [0, 8, 0, 8] },
    { text: 'INFORME FOTOGRÁFICO — MEDICINA ESTÉTICA', fontSize: 12.5, bold: true, alignment: 'center' },
    { text: `Generado el ${generated} por ${input.generatedBy}`, fontSize: 8.5, color: COLOR.muted, alignment: 'center', margin: [0, 2, 0, 6] },
    band('Datos del paciente'),
    {
      table: {
        widths: ['30%', '70%'],
        body: [
          ['Nombre', patient.name],
          ['Documento', patient.document || '—'],
          ['Edad', patient.age !== null ? `${patient.age} años` : '—'],
          ['Fotos incluidas', String(input.photos.length)],
        ].map(([l, v]) => [
          { text: l, bold: true, fontSize: 9, color: COLOR.title },
          { text: v, fontSize: 9 },
        ]),
      },
      layout: 'noBorders',
    },
  ];

  if (before && after) {
    body.push(...section(`Comparativo · ${photoAngleLabel(before.angle)}`, [{ columns: [photoCell(before, 300), photoCell(after, 300)], columnGap: 16 }]));
  }

  if (!input.photos.length) {
    body.push({ text: 'El paciente no tiene fotos clasificadas.', italics: true, color: COLOR.muted, margin: [0, 10, 0, 0] });
  }
  for (const g of groupByAngle(input.photos)) {
    body.push(...section(`Vista ${photoAngleLabel(g.angle)} (${g.list.length})`, pairs(g.list, 260)));
  }

  body.push({
    text:
      'Documento con información clínica confidencial, de uso exclusivo del paciente y del equipo tratante. ' +
      'Las imágenes corresponden a los archivos anexados a la historia clínica; el sistema no las retoca. ' +
      'Su uso con fines de divulgación requiere la autorización expresa del paciente.',
    fontSize: 7.5,
    italics: true,
    color: COLOR.muted,
    margin: [0, 14, 0, 0],
  });

  return {
    pageSize: 'LETTER',
    pageMargins: [48, 40, 48, 48],
    defaultStyle: { font: 'Helvetica', fontSize: 9.5, color: '#1a1a1a' },
    info: { title: `Informe fotográfico — ${patient.name}` },
    footer: (current: number, total: number) => ({
      columns: [
        { text: `${provider.name} · Informe fotográfico de ${patient.name}`, fontSize: 7.5, color: COLOR.muted },
        { text: `Página ${current} de ${total}`, fontSize: 7.5, color: COLOR.muted, alignment: 'right' },
      ],
      margin: [48, 12, 48, 0],
    }),
    content: body,
  };
}
