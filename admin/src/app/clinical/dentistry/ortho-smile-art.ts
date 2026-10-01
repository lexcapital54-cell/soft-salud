import { GINGIVAL_SMILE_LIMIT, OrthoExamData, THIRD_PCT_REF, num } from './ortho-exam.models';

/** Geometría ilustrativa (no a escala) de la sonrisa frontal y de los tercios faciales. */

const CX = 120;
const GUM_MARGIN = 44;
/** Premolar, canino, lateral y central de cada hemiarcada (ancho y largo de corona ilustrativos). */
const TEETH: Array<{ w: number; len: number; cusp: boolean }> = [
  { w: 14, len: 31, cusp: true },
  { w: 17, len: 40, cusp: true },
  { w: 19, len: 36, cusp: false },
  { w: 25, len: 44, cusp: false },
  { w: 25, len: 44, cusp: false },
  { w: 19, len: 36, cusp: false },
  { w: 17, len: 40, cusp: true },
  { w: 14, len: 31, cusp: true },
];

export interface SmileArt {
  teeth: Array<{ d: string; x: number }>;
  gum: string;
  mouth: string;
  upperLip: string;
  lowerLip: string;
  arcLine: string;
  midline: { y1: number; y2: number };
  occlusal: { x1: number; y1: number; x2: number; y2: number };
  tilt: number;
  gumShown: boolean;
}

export function smileArt(s: OrthoExamData['smile']): SmileArt {
  const half = TEETH.reduce((a, t) => a + t.w, 0) / 2;
  const span = half - TEETH[0].w;
  let x = CX - half;
  const edgeOffset = (t: number) => {
    const k = Math.min(1, t * t);
    if (s.smileArc === 'Plano') return 0;
    if (s.smileArc === 'Invertido') return -7 * (1 - k);
    return 7 * (1 - k);
  };
  const edges: Array<[number, number]> = [];
  const teeth = TEETH.map((tooth) => {
    const mid = x + tooth.w / 2;
    const edge = GUM_MARGIN + tooth.len - 8 + edgeOffset((mid - CX) / span);
    const x0 = x + 0.8;
    const x1 = x + tooth.w - 0.8;
    const neck = 1.2;
    const top = `M${x0 + neck},${GUM_MARGIN + 4} Q${mid},${GUM_MARGIN - 5} ${x1 - neck},${GUM_MARGIN + 4}`;
    const tip = tooth.cusp
      ? ` L${x1},${edge - 6} Q${x1 - 1},${edge - 2} ${mid + 1.5},${edge} Q${mid},${edge + 0.8} ${mid - 1.5},${edge} Q${x0 + 1},${edge - 2} ${x0},${edge - 6}`
      : ` L${x1},${edge - 4} Q${x1},${edge} ${x1 - 4},${edge} L${x0 + 4},${edge} Q${x0},${edge} ${x0},${edge - 4}`;
    x += tooth.w;
    edges.push([mid, edge]);
    return { d: `${top}${tip} Z`, x: mid };
  });
  const arc = edges.slice(1, -1);
  const arcLine = 'M' + arc.map(([ex, ey]) => `${ex},${ey}`).join(' L');

  const g = num(s.gingivalExposure);
  const gumPx = g !== null && g > 0 ? Math.min(18, 3 + g * 2.5) : 10;
  const lipY = s.smileLine === 'Alta' ? GUM_MARGIN - gumPx : s.smileLine === 'Baja' ? GUM_MARGIN + 12 : GUM_MARGIN - 1;
  const asym = s.symmetry === 'Asimétrica' ? 9 : 0;
  const lc = { x: 30, y: lipY + 16 };
  const rc = { x: 210, y: lipY + 16 - asym };
  const upperC = { x: CX, y: 2 * lipY - (lc.y + rc.y) / 2 };
  const lowerY = GUM_MARGIN + 46;
  const lowerC = { x: CX, y: 2 * lowerY - (lc.y + rc.y) / 2 };
  const upperEdge = `M${lc.x},${lc.y} Q${upperC.x},${upperC.y} ${rc.x},${rc.y}`;
  const bow = Math.min(lc.y, rc.y) - 30;
  const upperLip =
    `${upperEdge} C${rc.x - 22},${rc.y - 14} ${CX + 34},${bow - 2} ${CX + 11},${bow} ` +
    `Q${CX},${bow + 5} ${CX - 11},${bow} C${CX - 34},${bow - 2} ${lc.x + 22},${lc.y - 14} ${lc.x},${lc.y} Z`;
  const lowerLip = `M${lc.x},${lc.y} Q${lowerC.x},${lowerC.y} ${rc.x},${rc.y} C${rc.x - 30},${lowerC.y - 6} ${CX + 40},${lowerY + 22} ${CX},${lowerY + 22} C${CX - 40},${lowerY + 22} ${lc.x + 30},${lowerC.y - 6} ${lc.x},${lc.y} Z`;
  const mouth = `${upperEdge} Q${lowerC.x},${lowerC.y} ${lc.x},${lc.y} Z`;
  const tilt = s.occlusalCant === 'Inclinado a la derecha' ? -4 : s.occlusalCant === 'Inclinado a la izquierda' ? 4 : 0;
  const plane = GUM_MARGIN + 36;
  return {
    teeth,
    gum: `M20,${GUM_MARGIN - 30} L220,${GUM_MARGIN - 30} L220,${GUM_MARGIN + 8} L20,${GUM_MARGIN + 8} Z`,
    mouth,
    upperLip,
    lowerLip,
    arcLine,
    midline: { y1: bow - 6, y2: lowerY + 26 },
    occlusal: { x1: 40, y1: plane, x2: 200, y2: plane },
    tilt,
    gumShown: s.smileLine === 'Alta' || (g !== null && g > GINGIVAL_SMILE_LIMIT),
  };
}

export interface FaceThird {
  key: 'upper' | 'middle' | 'lower';
  label: string;
  y: number;
  h: number;
  pct: number | null;
  off: boolean;
}

/** Tercios dibujados con su proporción medida (iguales y punteados si aún no hay datos). */
export function faceThirds(pcts: { upper: number | null; middle: number | null; lower: number | null }, top = 24, height = 180): FaceThird[] {
  const have = pcts.upper !== null && pcts.middle !== null && pcts.lower !== null;
  const share = have ? [pcts.upper!, pcts.middle!, pcts.lower!] : [33.3, 33.3, 33.4];
  const total = share.reduce((a, b) => a + b, 0);
  const labels = [
    ['upper', 'Superior'],
    ['middle', 'Medio'],
    ['lower', 'Inferior'],
  ] as const;
  let y = top;
  return labels.map(([key, label], i) => {
    const h = (share[i] / total) * height;
    const pct = have ? share[i] : null;
    const third: FaceThird = { key, label, y, h, pct, off: pct !== null && (pct < THIRD_PCT_REF[0] || pct > THIRD_PCT_REF[1]) };
    y += h;
    return third;
  });
}

/** Escala horizontal del contorno según el índice facial (más ancho en caras euriprosopas). */
export function faceWidthScale(idx: number | null) {
  if (idx === null) return 1;
  return Math.max(0.86, Math.min(1.14, 88 / idx));
}
