/**
 * Zonas cliqueables del mapa corporal (viewBox 0 0 200 380). En la vista
 * anterior el lado derecho del paciente queda a la izquierda de la pantalla; en
 * la posterior, a la derecha.
 */
export type BodyView = 'ant' | 'post';

export type ZoneShape =
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r: number };

export interface BodyZone {
  /** `ant:hombro_der`, `post:lumbar`… (lo que se guarda en la historia). */
  id: string;
  label: string;
  shape: ZoneShape;
}

const e = (cx: number, cy: number, rx: number, ry: number): ZoneShape => ({ kind: 'ellipse', cx, cy, rx, ry });
const r = (x: number, y: number, w: number, h: number, rr = 6): ZoneShape => ({ kind: 'rect', x, y, w, h, r: rr });

const mirror = (s: ZoneShape): ZoneShape =>
  s.kind === 'ellipse' ? { ...s, cx: 200 - s.cx } : { ...s, x: 200 - s.x - s.w };

/** Zona par dibujada a la izquierda de la pantalla; se refleja para el otro lado. */
function pair(view: BodyView, key: string, label: string, leftShape: ZoneShape): BodyZone[] {
  const leftSide = view === 'ant' ? 'der' : 'izq';
  const rightSide = view === 'ant' ? 'izq' : 'der';
  const feminine = label.endsWith('a') || label === 'Mano';
  const named = (s: string) => `${label} ${s === 'der' ? 'derech' : 'izquierd'}${feminine ? 'a' : 'o'}`;
  return [
    { id: `${view}:${key}_${leftSide}`, label: named(leftSide), shape: leftShape },
    { id: `${view}:${key}_${rightSide}`, label: named(rightSide), shape: mirror(leftShape) },
  ];
}

const limbs = (view: BodyView): BodyZone[] => [
  ...pair(view, 'hombro', 'Hombro', e(70, 74, 13, 10)),
  ...pair(view, 'brazo', 'Brazo', r(52, 84, 14, 42, 7)),
  ...pair(view, 'codo', 'Codo', e(58, 132, 8, 7)),
  ...pair(view, 'antebrazo', 'Antebrazo', r(47, 140, 13, 38, 6)),
  ...pair(view, 'muneca', 'Muñeca', e(52, 184, 7, 5)),
  ...pair(view, 'mano', 'Mano', e(50, 200, 9, 12)),
  ...pair(view, 'muslo', 'Muslo', r(80, 182, 18, 70, 9)),
  ...pair(view, 'rodilla', 'Rodilla', e(89, 261, 10, 10)),
  ...pair(view, view === 'ant' ? 'pierna' : 'pantorrilla', view === 'ant' ? 'Pierna' : 'Pantorrilla', r(81, 273, 16, 64, 8)),
  ...pair(view, 'tobillo', 'Tobillo', e(89, 345, 8, 5)),
  ...pair(view, 'pie', 'Pie', e(87, 359, 11, 7)),
];

export const BODY_ZONES: Record<BodyView, BodyZone[]> = {
  ant: [
    { id: 'ant:cuello', label: 'Cuello', shape: r(92, 50, 16, 14, 4) },
    { id: 'ant:torax', label: 'Tórax', shape: r(77, 64, 46, 50, 12) },
    { id: 'ant:abdomen', label: 'Abdomen', shape: r(80, 114, 40, 42, 10) },
    ...pair('ant', 'cadera', 'Cadera', e(85, 168, 12, 11)),
    ...limbs('ant'),
  ],
  post: [
    { id: 'post:cervical', label: 'Región cervical', shape: r(92, 50, 16, 14, 4) },
    { id: 'post:dorsal', label: 'Región dorsal', shape: r(89, 66, 22, 46, 8) },
    ...pair('post', 'escapula', 'Escápula', e(79, 90, 9, 14)),
    { id: 'post:lumbar', label: 'Región lumbar', shape: r(83, 114, 34, 38, 10) },
    ...pair('post', 'gluteo', 'Glúteo', e(88, 168, 13, 12)),
    ...limbs('post'),
  ],
};

type Pt = [number, number];

/** Curva Catmull-Rom cerrada convertida a Bézier cúbicas. */
function smoothClosed(pts: Pt[]): string {
  const n = pts.length;
  const at = (i: number) => pts[(i + n) % n];
  let d = `M${at(0)[0]} ${at(0)[1]}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
  }
  return `${d} Z`;
}

/** Mitad izquierda (de la pantalla) del contorno, del cuello a la entrepierna. */
const HALF_OUTLINE: Pt[] = [
  // cuello, trapecio y deltoides
  [94, 46], [93, 56], [88, 60], [80, 63], [71, 65], [64, 68], [59, 74], [56, 82],
  // brazo (bíceps / tríceps) y codo
  [54, 92], [53, 104], [51, 116], [50, 126], [49, 133],
  // antebrazo y muñeca
  [47, 142], [45, 154], [44, 168], [45, 179], [45, 184],
  // mano
  [42, 190], [40, 198], [40, 206], [42, 212], [46, 216], [51, 215], [55, 210], [57, 202], [57, 192], [57, 186],
  // cara interna del antebrazo y del brazo hasta la axila
  [58, 176], [60, 160], [62, 146], [64, 134], [66, 120], [67, 108], [68, 99], [71, 94], [75, 96],
  // tronco: dorsal, cintura y cadera
  [77, 104], [78, 116], [80, 128], [80, 138], [78, 150], [76, 162], [76, 174],
  // muslo, rodilla, pantorrilla y tobillo
  [77, 190], [78, 206], [80, 226], [81, 242], [83, 252], [83, 262], [82, 270], [80, 282], [79, 294],
  [81, 308], [83, 322], [85, 338], [85, 346],
  // pie
  [82, 353], [79, 360], [79, 365], [84, 368], [92, 368], [97, 366], [97, 358], [95, 350],
  // cara interna de la pierna hasta la entrepierna
  [94, 342], [94, 326], [95, 308], [97, 292], [96, 278], [96, 266], [97, 256], [97, 240], [98, 220],
  [99, 204], [100, 194],
];

export const BODY_OUTLINE = smoothClosed([
  ...HALF_OUTLINE,
  ...HALF_OUTLINE.slice(0, -1).reverse().map(([x, y]): Pt => [200 - x, y]),
]);

/** Cabeza con mandíbula y mentón. */
export const BODY_HEAD = 'M100 6 C111.5 6 117 15 117 27 C117 37 112.5 44.5 106 48 L94 48 C87.5 44.5 83 37 83 27 C83 15 88.5 6 100 6 Z';
export const BODY_EARS = [
  { cx: 82.6, cy: 28, rx: 2, ry: 4.2 },
  { cx: 117.4, cy: 28, rx: 2, ry: 4.2 },
];

/** Refleja un trazo con comandos absolutos M/L/Q/C respecto al eje del cuerpo (x = 100). */
function mirrorPath(d: string): string {
  let i = 0;
  return d.replace(/-?\d+(\.\d+)?/g, (n) => (i++ % 2 === 0 ? String(+(200 - +n).toFixed(1)) : n));
}

const both = (...paths: string[]) => paths.flatMap((d) => [d, mirrorPath(d)]);

const FINGERS = both('M44.5 207 L45.5 214', 'M48.5 208 L49.5 215.5', 'M52.5 207.5 L53 213.5', 'M56.5 196 Q54 200 55 206');

export interface BodyDetails {
  /** Contornos musculares (trazo fino). */
  lines: string[];
  /** Puntos de referencia: ombligo, hoyuelos lumbares… */
  dots: Array<{ cx: number; cy: number; r: number }>;
  /** Columna vertebral punteada (solo vista posterior). */
  spine?: string;
}

/** Trazos anatómicos de referencia (no cliqueables). */
export const BODY_DETAILS: Record<BodyView, BodyDetails> = {
  ant: {
    lines: [
      ...both(
        'M95 50 Q96 58 98.5 65', // esternocleidomastoideo
        'M86.5 66 Q93 69.5 99 68', // clavícula
        'M66 70 Q71 80 69 92', // deltoides
        'M77 82 Q84 100 99 98', // pectoral
        'M57 92 Q61.5 104 59.5 118', // bíceps
        'M52 145 Q54 160 50.5 176', // antebrazo
        'M90 104 Q88.5 126 92 150', // recto abdominal
        'M91 113 Q95.5 114.5 99 113.5', // abdominales
        'M91 125 Q95.5 126.5 99 125.5',
        'M92 137 Q96 138 99 137.5',
        'M80.5 158 Q90 171 99 186', // ingle
        'M84 196 Q86 222 89 246', // cuádriceps
        'M95.5 212 Q93 234 91 248', // vasto medial
        'M86 256.5 Q90 250.5 94 256.5 Q90 263 86 256.5', // rótula
        'M90.5 276 Q88 302 90 336', // tibia
      ),
      'M100 100 L100 150', // línea alba
      ...FINGERS,
    ],
    dots: [{ cx: 100, cy: 143, r: 1.2 }],
  },
  post: {
    lines: [
      ...both(
        'M93 54 Q90 60 86 64', // trapecio superior
        'M86 66 Q95 84 100 104', // trapecio inferior
        'M83 79 Q90 80 92.5 83 Q91.5 96 88 104 Q81 94 83 79', // escápula
        'M56.5 88 Q60.5 101 58.5 116', // tríceps
        'M77.5 104 Q86 121 92.5 137', // dorsal ancho
        'M78.5 166 Q88 160 99 166', // glúteo superior
        'M80 188 Q90 193.5 99 189', // pliegue glúteo
        'M89 198 Q88 222 89.5 246', // isquiotibiales
        'M84 262 Q90 266.5 96 262', // hueco poplíteo
        'M83.5 276 Q81.5 293 88.5 307', // gemelo externo
        'M95.5 276 Q97.5 293 90.5 307', // gemelo interno
        'M90 318 L90.5 341', // tendón de Aquiles
      ),
      'M100 162 L100 188', // pliegue interglúteo
      ...FINGERS,
    ],
    dots: [
      { cx: 95.5, cy: 151, r: 0.9 },
      { cx: 104.5, cy: 151, r: 0.9 },
    ],
    spine: 'M100 52 L100 158',
  },
};

export interface BodyLabel {
  text: string;
  /** Punto anatómico al que apunta la guía. */
  ax: number;
  ay: number;
  /** Altura del texto. */
  ly: number;
}

const lb = (text: string, ax: number, ay: number, ly = ay): BodyLabel => ({ text, ax, ay, ly });

/** Rótulos con guía: a la izquierda en la vista anterior y a la derecha en la posterior. */
export const BODY_LABELS: Record<BodyView, BodyLabel[]> = {
  ant: [
    lb('Cuello', 95, 57), lb('Hombro', 63, 75), lb('Brazo', 55, 104), lb('Codo', 51, 131),
    lb('Antebrazo', 47, 153, 151), lb('Muñeca', 46, 183), lb('Mano', 44, 200, 199),
    lb('Cadera', 79, 166, 167), lb('Muslo', 81, 215), lb('Rodilla', 84, 260),
    lb('Tobillo', 86, 343), lb('Pie', 82, 359),
  ],
  post: [
    lb('Región cervical', 100, 56), lb('Región dorsal', 100, 90), lb('Escápula', 116, 98, 104),
    lb('Región lumbar', 100, 132), lb('Glúteos', 116, 172), lb('Muslo', 120, 215),
    lb('Rodilla', 117, 261), lb('Pantorrilla', 118, 300), lb('Tobillo', 114, 343), lb('Pie', 119, 360),
  ],
};

const ALL_ZONES = new Map([...BODY_ZONES.ant, ...BODY_ZONES.post].map((z) => [z.id, z]));

/** "Hombro derecho (vista anterior)". */
export function zoneLabel(id: string): string {
  const zone = ALL_ZONES.get(id);
  if (!zone) return id;
  return `${zone.label} (${id.startsWith('ant:') ? 'anterior' : 'posterior'})`;
}

export const isKnownZone = (id: string) => ALL_ZONES.has(id);
