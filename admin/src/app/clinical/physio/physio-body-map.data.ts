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

const ALL_ZONES = new Map([...BODY_ZONES.ant, ...BODY_ZONES.post].map((z) => [z.id, z]));

/** "Hombro derecho (vista anterior)". */
export function zoneLabel(id: string): string {
  const zone = ALL_ZONES.get(id);
  if (!zone) return id;
  return `${zone.label} (${id.startsWith('ant:') ? 'anterior' : 'posterior'})`;
}

export const isKnownZone = (id: string) => ALL_ZONES.has(id);
