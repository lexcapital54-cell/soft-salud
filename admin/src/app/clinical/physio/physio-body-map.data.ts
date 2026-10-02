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
  [93, 46], [92, 57], [82, 63], [69, 66], [61, 72], [56, 83], [54, 98], [51, 114], [49, 130],
  [45, 148], [43, 166], [45, 181], [41, 191], [40, 203], [44, 213], [52, 213], [57, 202], [57, 189],
  [59, 179], [61, 161], [63, 144], [65, 129], [67, 112], [69, 98], [74, 93], [78, 106], [80, 124],
  [78, 146], [76, 164], [77, 190], [79, 222], [82, 252], [82, 268], [79, 292], [82, 318], [85, 341],
  [81, 354], [79, 363], [86, 368], [96, 367], [97, 356], [94, 341], [95, 318], [96, 292], [96, 266],
  [97, 240], [98, 206], [100, 192],
];

export const BODY_OUTLINE = smoothClosed([
  ...HALF_OUTLINE,
  ...HALF_OUTLINE.slice(0, -1).reverse().map(([x, y]): Pt => [200 - x, y]),
]);

export const BODY_HEAD = { cx: 100, cy: 28, rx: 16, ry: 21 };

const both = (d: string, m: string) => [d, m];

/** Trazos anatómicos de referencia (no cliqueables). */
export const BODY_DETAILS: Record<BodyView, string[]> = {
  ant: [
    ...both('M86 67 Q93 71 99 69', 'M114 67 Q107 71 101 69'),
    ...both('M80 97 Q90 104 99 99', 'M120 97 Q110 104 101 99'),
    'M100 102 L100 150',
    'M98.6 140 a1.4 1.4 0 1 0 2.8 0 a1.4 1.4 0 1 0 -2.8 0',
    ...both('M81 160 Q91 172 99 184', 'M119 160 Q109 172 101 184'),
    ...both('M85 256 Q90 262 95 256', 'M115 256 Q110 262 105 256'),
  ],
  post: [
    'M100 54 L100 160',
    ...both('M84 80 Q80 94 88 104', 'M116 80 Q120 94 112 104'),
    ...both('M84 150 Q92 147 99 152', 'M116 150 Q108 147 101 152'),
    'M100 162 L100 186',
    ...both('M80 186 Q90 191 99 187', 'M120 186 Q110 191 101 187'),
    ...both('M84 266 Q90 270 96 266', 'M116 266 Q110 270 104 266'),
  ],
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
