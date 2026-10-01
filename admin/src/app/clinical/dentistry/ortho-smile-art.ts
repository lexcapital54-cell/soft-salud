import { GINGIVAL_SMILE_LIMIT, OrthoExamData, THIRD_PCT_REF, num } from './ortho-exam.models';

/** Geometría ilustrativa (no a escala) de la sonrisa frontal y de los tercios faciales. */

const CX = 120;
const GUM_MARGIN = 44;
const TEETH = [
  { w: 18, len: 40 },
  { w: 20, len: 37 },
  { w: 26, len: 44 },
  { w: 26, len: 44 },
  { w: 20, len: 37 },
  { w: 18, len: 40 },
];

export interface SmileArt {
  teeth: Array<{ d: string; x: number }>;
  gum: string;
  mouth: string;
  upperLip: string;
  lowerLip: string;
  occlusal: { x1: number; y1: number; x2: number; y2: number };
  tilt: number;
  gumShown: boolean;
}

export function smileArt(s: OrthoExamData['smile']): SmileArt {
  const half = TEETH.reduce((a, t) => a + t.w, 0) / 2;
  let x = CX - half;
  const edgeOffset = (t: number) => {
    if (s.smileArc === 'Plano') return 0;
    if (s.smileArc === 'Invertido') return -8 * (1 - t * t);
    return 8 * (1 - t * t);
  };
  const teeth = TEETH.map((tooth) => {
    const mid = x + tooth.w / 2;
    const t = (mid - CX) / half;
    const edge = GUM_MARGIN + tooth.len - 8 + edgeOffset(t);
    const r = 5;
    const x0 = x + 1;
    const x1 = x + tooth.w - 1;
    const d = `M${x0},${GUM_MARGIN + 5} Q${mid},${GUM_MARGIN - 5} ${x1},${GUM_MARGIN + 5} L${x1},${edge - r} Q${x1},${edge} ${x1 - r},${edge} L${x0 + r},${edge} Q${x0},${edge} ${x0},${edge - r} Z`;
    x += tooth.w;
    return { d, x: mid };
  });

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
  const upperLip = `${upperEdge} Q${CX},${upperC.y - 30} ${lc.x},${lc.y} Z`;
  const lowerLip = `M${lc.x},${lc.y} Q${lowerC.x},${lowerC.y} ${rc.x},${rc.y} Q${CX},${lowerC.y + 36} ${lc.x},${lc.y} Z`;
  const mouth = `${upperEdge} Q${lowerC.x},${lowerC.y} ${lc.x},${lc.y} Z`;
  const tilt = s.occlusalCant === 'Inclinado a la derecha' ? -4 : s.occlusalCant === 'Inclinado a la izquierda' ? 4 : 0;
  const plane = GUM_MARGIN + 36;
  return {
    teeth,
    gum: `M20,${GUM_MARGIN - 30} L220,${GUM_MARGIN - 30} L220,${GUM_MARGIN + 8} L20,${GUM_MARGIN + 8} Z`,
    mouth,
    upperLip,
    lowerLip,
    occlusal: { x1: 44, y1: plane, x2: 196, y2: plane },
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

/** Semiancho del óvalo facial según el índice (más ancho en caras euriprosopas). */
export function faceHalfWidth(idx: number | null) {
  if (idx === null) return 56;
  return Math.max(44, Math.min(70, 56 * (88 / idx)));
}
