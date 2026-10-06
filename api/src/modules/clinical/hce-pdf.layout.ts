/**
 * Piezas visuales del resumen PDF de la historia clínica (pdfmake).
 * Solo presentación: reciben textos ya resueltos y nunca alteran el contenido clínico.
 */
import type { Content, CustomTableLayout } from 'pdfmake/interfaces';

export const HCE_PALETTE = {
  navy: '#0B2239',
  navy2: '#163A59',
  gold: '#C79A4B',
  goldSoft: '#FBF6EC',
  ink: '#172033',
  muted: '#687386',
  line: '#DCE3EA',
  soft: '#F6F8FA',
  soft2: '#F1F5F8',
  head: '#EAF0F5',
  success: '#1FA774',
  warning: '#D99A32',
  error: '#D45B5B',
} as const;

const P = HCE_PALETTE;

/** A4 vertical: 595.28 pt de ancho, márgenes laterales de 17 mm. */
export const HCE_PAGE = {
  size: 'A4' as const,
  side: 48,
  top: 66,
  bottom: 56,
  width: 595.28,
  get content() {
    return this.width - this.side * 2;
  },
};

type Margin = [number, number, number, number];

const ICON_PATHS: Record<string, string> = {
  calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  file: '<path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z"/><path d="M14 2.5V8h5.5M8.5 13h7M8.5 17h5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5.5 16a3.2 3.2 0 0 1 6 0M14 10h4.5M14 13.5h3"/>',
  monitor: '<rect x="2.5" y="3.5" width="19" height="13" rx="2"/><path d="M8 21h8M12 16.5V21"/>',
  building: '<path d="M4 21V5a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 15 5v16M15 9h3.5A1.5 1.5 0 0 1 20 10.5V21M2.5 21h19"/><path d="M8 7.5h3M8 11.5h3M8 15.5h3"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17.5" rx="2"/><path d="M9 4V2.5h6V4M8.5 10h7M8.5 14h7M8.5 18h4"/>',
  pulse: '<path d="M2.5 12h4l2.5-6 4.5 12 2.5-6h5.5"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.7 2.7L16.2 9.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  pen: '<path d="M15.5 4.5 19.5 8.5 8.5 19.5H4.5v-4z"/><path d="m13 7 4 4"/>',
  shield: '<path d="M12 2.5 4.5 5.5v6c0 4.6 3.2 8.4 7.5 10 4.3-1.6 7.5-5.4 7.5-10v-6z"/>',
};

/** Icono lineal SVG de la familia única del documento (sin emojis). */
export function icon(name: keyof typeof ICON_PATHS | string, size = 10, color: string = P.navy2): Content {
  const paths = ICON_PATHS[name] ?? ICON_PATHS.file;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`,
    width: size,
    height: size,
  } as Content;
}

const clean = (v: unknown) => {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return s === 'undefined' || s === 'null' || s === 'NaN' ? '' : s;
};

/** Bordes finos solo en el contorno de una celda única (tarjetas). */
export const boxLayout = (border: string = P.line, pad = 8): CustomTableLayout => ({
  hLineWidth: () => 0.6,
  vLineWidth: () => 0.6,
  hLineColor: () => border,
  vLineColor: () => border,
  paddingLeft: () => pad,
  paddingRight: () => pad,
  paddingTop: () => pad - 2,
  paddingBottom: () => pad - 2,
});

/** Tablas de datos: encabezado azul grisáceo, líneas horizontales suaves, sin verticales. */
export const dataTableLayout: CustomTableLayout = {
  hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0.6 : 0.4),
  vLineWidth: () => 0,
  hLineColor: () => P.line,
  fillColor: (row) => (row === 0 ? P.head : row % 2 === 0 ? '#FAFBFC' : null),
  paddingLeft: () => 5,
  paddingRight: () => 5,
  paddingTop: () => 3.5,
  paddingBottom: () => 3.5,
};

/** Variante para tablas de muchas columnas: menos relleno lateral. */
export const compactTableLayout: CustomTableLayout = {
  ...dataTableLayout,
  paddingLeft: () => 3,
  paddingRight: () => 3,
};

export function tableHeaderCell(text: string, compact = false): Content {
  return { text, bold: true, fontSize: compact ? 7.2 : 7.8, color: P.navy2 } as Content;
}

export function tableCell(text: string, bold = false, compact = false): Content {
  return { text: clean(text) || '—', fontSize: compact ? 7.6 : 8.3, bold, color: clean(text) ? P.ink : P.muted } as Content;
}

/** Bloque principal de la primera página: título, subtítulo y especialidad real. */
export function documentHeading(specialty: string, subtitle: string): Content {
  const w = HCE_PAGE.content;
  return {
    stack: [
      {
        text: 'RESUMEN DE HISTORIA CLÍNICA',
        font: 'Times',
        bold: true,
        fontSize: 21,
        color: P.navy,
        alignment: 'center',
        characterSpacing: 0.6,
      },
      {
        text: subtitle,
        fontSize: 9.5,
        color: P.muted,
        alignment: 'center',
        margin: [0, 3, 0, 5] as Margin,
      },
      {
        canvas: [
          { type: 'line', x1: 0, y1: 3, x2: w / 2 - 34, y2: 3, lineWidth: 0.5, lineColor: P.line },
          { type: 'line', x1: w / 2 - 26, y1: 3, x2: w / 2 + 26, y2: 3, lineWidth: 1.6, lineColor: P.gold },
          { type: 'line', x1: w / 2 + 34, y1: 3, x2: w, y2: 3, lineWidth: 0.5, lineColor: P.line },
        ],
      },
      specialty
        ? {
            text: specialty.toUpperCase(),
            fontSize: 8.5,
            bold: true,
            color: P.gold,
            alignment: 'center',
            characterSpacing: 1.6,
            margin: [0, 6, 0, 0] as Margin,
          }
        : { text: '' },
    ],
    margin: [0, 0, 0, 12] as Margin,
  } as Content;
}

export type MetaItem = { icon: string; label: string; value: string };

/** Fila de metadatos con icono; omite valores vacíos y reparte el ancho. */
export function metaStrip(items: MetaItem[]): Content {
  const filled = items.filter((i) => clean(i.value));
  if (!filled.length) return { text: '' };
  const perRow = 4;
  const body: Content[][] = [];
  for (let i = 0; i < filled.length; i += perRow) {
    const slice = filled.slice(i, i + perRow);
    const row: Content[] = slice.map(
      (m) =>
        ({
          columns: [
            { ...(icon(m.icon, 10) as object), width: 12, margin: [0, 1, 0, 0] },
            {
              width: '*',
              stack: [
                { text: m.label.toUpperCase(), fontSize: 6.6, color: P.muted, characterSpacing: 0.4 },
                { text: clean(m.value), fontSize: 8.6, bold: true, color: P.ink, margin: [0, 1, 0, 0] },
              ],
            },
          ],
          columnGap: 5,
        }) as Content,
    );
    while (row.length < perRow) row.push({ text: '' });
    body.push(row);
  }
  return {
    table: { widths: Array(perRow).fill('*'), body },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 0.6 : 0.4),
      vLineWidth: (i: number, node: { table: { widths?: unknown[] } }) => (i === 0 || i === (node.table.widths?.length ?? 0) ? 0 : 0.4),
      hLineColor: () => P.line,
      vLineColor: () => P.line,
      fillColor: () => P.soft,
      paddingLeft: () => 7,
      paddingRight: () => 7,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    } as CustomTableLayout,
    margin: [0, 0, 0, 10] as Margin,
  } as Content;
}

/** Rejilla etiqueta-sobre-valor; solo campos con dato. */
export function fieldGrid(rows: Array<[string, string]>, cols = 2): Content | null {
  const filled = rows.map(([l, v]) => [l, clean(v)] as [string, string]).filter(([, v]) => v);
  if (!filled.length) return null;
  const body: Content[][] = [];
  for (let i = 0; i < filled.length; i += cols) {
    const row: Content[] = filled.slice(i, i + cols).map(
      ([label, value]) =>
        ({
          stack: [
            { text: label.toUpperCase(), fontSize: 6.6, color: P.muted, characterSpacing: 0.4 },
            { text: value, fontSize: 8.8, color: P.ink, margin: [0, 1, 0, 0] },
          ],
        }) as Content,
    );
    while (row.length < cols) row.push({ text: '' });
    body.push(row);
  }
  return {
    table: { widths: Array(cols).fill('*'), body },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 8,
      paddingTop: () => 2.5,
      paddingBottom: () => 2.5,
    } as CustomTableLayout,
  } as Content;
}

function cardTitle(title: string, iconName: string): Content {
  return {
    columns: [
      { ...(icon(iconName, 10, P.gold) as object), width: 12, margin: [0, 1, 0, 0] },
      { text: title.toUpperCase(), font: 'Times', bold: true, fontSize: 10, color: P.navy, characterSpacing: 0.5, width: '*' },
    ],
    columnGap: 5,
    margin: [0, 0, 0, 4] as Margin,
  } as Content;
}

/** Tarjeta con contorno fino, título con icono y cuerpo libre. */
export function card(title: string, iconName: string, inner: Content[], fill: string | null = null): Content {
  return {
    table: {
      widths: ['*'],
      body: [[{ stack: [cardTitle(title, iconName), ...inner], ...(fill ? { fillColor: fill } : {}) }]],
    },
    layout: boxLayout(P.line, 9),
  } as Content;
}

/** Datos del paciente: foto (si existe), nombre y campos registrados. */
export function patientCard(name: string, fields: Array<[string, string]>, photo: string | null): Content {
  const grid = fieldGrid(fields, 2);
  const right: Content[] = [
    { text: clean(name) || 'Paciente', font: 'Times', bold: true, fontSize: 13, color: P.navy, margin: [0, 0, 0, 3] } as Content,
    ...(grid ? [grid] : []),
  ];
  const inner: Content = photo
    ? ({
        columns: [
          {
            width: 64,
            table: { widths: [58], body: [[{ image: photo, fit: [58, 70], alignment: 'center' }]] },
            layout: boxLayout(P.gold, 2),
          },
          { width: '*', stack: right },
        ],
        columnGap: 10,
      } as Content)
    : ({ stack: right } as Content);
  return card('Datos del paciente', 'user', [inner]);
}

export type SummaryRow = { icon: string; label: string; value: string; tone?: 'success' | 'warning' | 'error' };

/** Recuadro "Resumen clínico" con fondo suave; solo filas con dato. */
export function clinicalSummary(rows: SummaryRow[]): Content {
  const filled = rows.filter((r) => clean(r.value));
  const inner: Content[] = filled.map(
    (r) =>
      ({
        columns: [
          { ...(icon(r.icon, 9.5) as object), width: 11, margin: [0, 1.5, 0, 0] },
          {
            width: '*',
            stack: [
              { text: r.label.toUpperCase(), fontSize: 6.6, color: P.muted, characterSpacing: 0.4 },
              {
                text: clean(r.value),
                fontSize: 8.6,
                bold: !!r.tone,
                color: r.tone ? P[r.tone] : P.ink,
                margin: [0, 1, 0, 0],
              },
            ],
          },
        ],
        columnGap: 5,
        margin: [0, 2, 0, 3] as Margin,
      }) as Content,
  );
  if (!inner.length) inner.push({ text: 'Sin información registrada', fontSize: 8.5, color: P.muted } as Content);
  return card('Resumen clínico', 'clipboard', inner, P.soft2);
}

/** Encabezado de sección numerada (o sin número si n es null). */
export function sectionHeader(n: number | null, title: string): Content {
  return {
    table: {
      widths: n === null ? ['*'] : [17, '*'],
      body: [
        [
          ...(n === null
            ? []
            : [
                {
                  text: String(n).padStart(2, '0'),
                  bold: true,
                  fontSize: 8,
                  color: '#FFFFFF',
                  fillColor: P.navy,
                  alignment: 'center',
                  margin: [0, 2.5, 0, 1.5],
                },
              ]),
          {
            text: title.toUpperCase(),
            font: 'Times',
            bold: true,
            fontSize: 11.5,
            color: P.navy,
            characterSpacing: 0.4,
            margin: [n === null ? 0 : 7, 1.5, 0, 0],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: (i: number) => (i === 1 ? 0.8 : 0),
      vLineWidth: () => 0,
      hLineColor: () => P.line,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 4,
    } as CustomTableLayout,
    margin: [0, 12, 0, 6] as Margin,
  } as Content;
}

const LABEL_LINE = /^([^:\n]{1,48}):\s(.+)$/;

/** Texto clínico completo; los bloques "Etiqueta: valor" resaltan la etiqueta sin alterar el texto. */
export function isStructuredText(value: string): boolean {
  return value
    .split('\n')
    .filter((l) => l.trim())
    .every((l) => LABEL_LINE.test(l.trim()));
}

export function richText(value: string, structured = isStructuredText(value)): Content {
  const linesOf = value.split('\n');
  if (!structured || !linesOf.filter((l) => l.trim()).every((l) => LABEL_LINE.test(l.trim()))) {
    return { text: value, fontSize: 9.3, color: P.ink, alignment: 'justify', lineHeight: 1.35 } as Content;
  }
  return {
    stack: linesOf
      .filter((l) => l.trim())
      .map((l) => {
        const [, label, rest] = LABEL_LINE.exec(l.trim()) as RegExpExecArray;
        return {
          text: [
            { text: `${label}: `, bold: true, color: P.navy2 },
            { text: rest, color: P.ink },
          ],
          fontSize: 9.1,
          lineHeight: 1.3,
          margin: [0, 0, 0, 1.5],
        };
      }),
  } as Content;
}

/**
 * Caja de contenido: gris suave; "highlight" usa barra dorada vertical (diagnóstico).
 * `join` quita el relleno en el borde donde continúa otro fragmento de la misma caja.
 */
export function contentBox(inner: Content, highlight = false, join?: 'top' | 'bottom'): Content {
  const margin: Margin = [9, join === 'top' ? 0 : 7, 9, join === 'bottom' ? 0 : 7];
  if (highlight) {
    return {
      table: {
        widths: [2.5, '*'],
        body: [[{ text: '', fillColor: P.gold }, { stack: [inner], fillColor: P.goldSoft, margin }]],
      },
      layout: 'noBorders',
    } as Content;
  }
  return {
    table: { widths: ['*'], body: [[{ stack: [inner], fillColor: P.soft, margin }]] },
    layout: 'noBorders',
  } as Content;
}

/**
 * Divide un texto largo en un primer fragmento corto (que viaja pegado al título) y el resto,
 * por límite de línea, frase o palabra. No se pierde ni se reordena texto.
 */
export function splitLead(value: string, target = 380): [string, string] {
  if (value.length <= target * 1.5) return [value, ''];
  const lines = value.split('\n');
  let acc = '';
  for (let i = 0; i < lines.length - 1; i++) {
    acc += (i ? '\n' : '') + lines[i];
    if (acc.length >= target / 2) return [acc, lines.slice(i + 1).join('\n')];
  }
  const head = value.slice(0, target);
  const sentence = head.lastIndexOf('. ') + 1;
  const cut = sentence >= target * 0.4 ? sentence : head.lastIndexOf(' ');
  if (cut <= 0) return [value, ''];
  return [value.slice(0, cut).trimEnd(), value.slice(cut).trimStart()];
}

export type MetricItem = { label: string; value: string; unit?: string; note?: string; tone?: 'success' | 'warning' | 'error' };

/** Tarjetas de métricas solo con valores cuantitativos reales (máx. 4 por fila). */
export function metricCards(items: MetricItem[]): Content | null {
  const filled = items.filter((m) => clean(m.value));
  if (!filled.length) return null;
  const rows: Content[] = [];
  for (let i = 0; i < filled.length; i += 4) {
    const slice = filled.slice(i, i + 4);
    const anyNote = slice.some((m) => m.note);
    const cols: Content[] = slice.map(
      (m) =>
        ({
          width: '*',
          table: {
            widths: ['*'],
            body: [
              [
                {
                  stack: [
                    { text: m.label.toUpperCase(), fontSize: 6.6, color: P.muted, characterSpacing: 0.4 },
                    {
                      text: [
                        { text: clean(m.value), font: 'Times', bold: true, fontSize: 15, color: m.tone ? P[m.tone] : P.navy },
                        ...(m.unit ? [{ text: ` ${m.unit}`, fontSize: 8, color: P.muted }] : []),
                      ],
                      margin: [0, 2, 0, 0],
                    },
                    ...(anyNote ? [{ text: m.note || ' ', fontSize: 7.4, color: P.muted, margin: [0, 1, 0, 0] }] : []),
                  ],
                },
              ],
            ],
          },
          layout: boxLayout(P.line, 7),
        }) as Content,
    );
    while (cols.length < 4) cols.push({ width: '*', text: '' } as Content);
    rows.push({ columns: cols, columnGap: 7, margin: [0, 0, 0, 7] as Margin } as Content);
  }
  return { stack: rows, unbreakable: true } as Content;
}

/** Gráfica de línea pequeña (0–10) solo con suficientes puntos reales. */
export function lineChart(title: string, points: Array<{ label: string; value: number }>, max = 10): Content | null {
  if (points.length < 2) return null;
  const w = HCE_PAGE.content - 20;
  const h = 80;
  const step = w / points.length;
  const y = (v: number) => 4 + h - (Math.max(0, Math.min(max, v)) / max) * h;
  const grid = [0, max / 2, max].map((g) => ({
    type: 'line',
    x1: 0,
    y1: y(g),
    x2: w,
    y2: y(g),
    lineWidth: 0.4,
    lineColor: P.line,
    ...(g === 0 ? {} : { dash: { length: 2 } }),
  }));
  const coords = points.map((p, i) => ({ x: step / 2 + i * step, y: y(p.value) }));
  return {
    unbreakable: true,
    stack: [
      { text: title, fontSize: 8, bold: true, color: P.navy2, margin: [0, 0, 0, 4] },
      {
        canvas: [
          ...grid,
          { type: 'polyline', lineWidth: 1.6, lineColor: P.navy2, points: coords },
          ...coords.map((c) => ({ type: 'ellipse', x: c.x, y: c.y, r1: 2.6, r2: 2.6, color: P.gold })),
        ],
      },
      {
        columns: points.map((p) => ({ width: step, text: `${p.label} · ${p.value}`, fontSize: 6.8, color: P.muted, alignment: 'center' })),
        columnGap: 0,
        margin: [0, 3, 0, 0],
      },
    ],
    margin: [0, 0, 0, 8] as Margin,
  } as Content;
}

export type SignatureSide = { title: string; image: string | null; name: string; details: string[]; pending?: string };

/** Firma: imagen guardada o línea en blanco; nunca una firma inventada. */
export function signatureColumn(s: SignatureSide): Content {
  const img = s.image ? (s.image.startsWith('data:') ? s.image : `data:image/png;base64,${s.image}`) : null;
  return {
    width: '*',
    stack: [
      { text: s.title.toUpperCase(), fontSize: 7, color: P.muted, characterSpacing: 0.6, margin: [0, 0, 0, 4] },
      img ? { image: img, fit: [170, 58], margin: [0, 0, 0, 2] } : { text: '', margin: [0, 0, 0, 52] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.7, lineColor: P.navy2 }] },
      { text: clean(s.name), bold: true, fontSize: 9.2, color: P.ink, margin: [0, 4, 0, 1] },
      ...s.details.filter((d) => clean(d)).map((d) => ({ text: d, fontSize: 7.8, color: P.muted })),
      ...(s.pending ? [{ text: s.pending, fontSize: 7.8, italics: true, color: P.warning, margin: [0, 2, 0, 0] }] : []),
    ],
  } as Content;
}

/** Encabezado discreto en cada página. */
export function runningHeader(left: Content, right: string): Content {
  return {
    stack: [
      {
        columns: [
          { ...(left as object), width: '*' },
          { text: right, width: 'auto', fontSize: 7.4, color: P.muted, alignment: 'right', margin: [0, 6, 0, 0] },
        ],
      },
      {
        canvas: [{ type: 'line', x1: 0, y1: 4, x2: HCE_PAGE.content, y2: 4, lineWidth: 0.5, lineColor: P.line }],
      },
    ],
    margin: [HCE_PAGE.side, 16, HCE_PAGE.side, 0] as Margin,
  } as Content;
}

/** Pie de página: consultorio, fecha de generación y "Página X de Y". */
export function runningFooter(left: string, generated: string, page: number, pages: number): Content {
  return {
    stack: [
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: HCE_PAGE.content, y2: 0, lineWidth: 0.5, lineColor: P.line }] },
      {
        columns: [
          { text: left, fontSize: 7.2, color: P.muted, width: '*' },
          { text: generated, fontSize: 7.2, color: P.muted, alignment: 'center', width: 'auto' },
          { text: `Página ${page} de ${pages}`, fontSize: 7.2, bold: true, color: P.navy2, alignment: 'right', width: '*' },
        ],
        columnGap: 10,
        margin: [0, 5, 0, 0] as Margin,
      },
    ],
    margin: [HCE_PAGE.side, 14, HCE_PAGE.side, 0] as Margin,
  } as Content;
}
