import { CephPoint } from './dentistry.models';

/** Puntos del análisis de sonrisa sobre fotografía (coordenadas en píxeles de la imagen original). */
export interface SmileLandmark {
  key: 'Md' | 'CR' | 'CL' | 'Mf' | 'R1' | 'R2' | 'R3' | 'L1' | 'L2' | 'L3';
  short: string;
  label: string;
  hint: string;
  optional?: boolean;
  group: 'ref' | 'teeth';
}

export const SMILE_LANDMARKS: SmileLandmark[] = [
  { key: 'Md', short: 'LMD', label: 'Línea media dental', hint: 'Punto de contacto entre los incisivos centrales superiores, a nivel del borde incisal.', group: 'ref' },
  { key: 'CR', short: 'CD', label: 'Comisura derecha', hint: 'Comisura labial derecha del paciente (a la izquierda en la foto).', group: 'ref' },
  { key: 'CL', short: 'CI', label: 'Comisura izquierda', hint: 'Comisura labial izquierda del paciente (a la derecha en la foto).', group: 'ref' },
  { key: 'Mf', short: 'LMF', label: 'Línea media facial', hint: 'Centro del filtrum o punto subnasal: referencia de la línea media de la cara.', optional: true, group: 'ref' },
  { key: 'R1', short: '12|11', label: 'Contacto 12 | 11', hint: 'Contacto entre el incisivo lateral y el central superior derechos, en el borde incisal.', optional: true, group: 'teeth' },
  { key: 'R2', short: '13|12', label: 'Contacto 13 | 12', hint: 'Contacto entre el canino y el incisivo lateral superior derechos.', optional: true, group: 'teeth' },
  { key: 'R3', short: 'D13', label: 'Distal del 13', hint: 'Borde distal visible del canino superior derecho.', optional: true, group: 'teeth' },
  { key: 'L1', short: '21|22', label: 'Contacto 21 | 22', hint: 'Contacto entre el incisivo central y el lateral superior izquierdos, en el borde incisal.', optional: true, group: 'teeth' },
  { key: 'L2', short: '22|23', label: 'Contacto 22 | 23', hint: 'Contacto entre el incisivo lateral y el canino superior izquierdos.', optional: true, group: 'teeth' },
  { key: 'L3', short: 'D23', label: 'Distal del 23', hint: 'Borde distal visible del canino superior izquierdo.', optional: true, group: 'teeth' },
];

/** mm por píxel según la distancia real entre comisuras; null si no está calibrado. */
export function smileScale(p: Partial<Record<string, CephPoint>>, refMm?: number): number | null {
  const { CR, CL } = p;
  if (!CR || !CL || !refMm || refMm <= 0) return null;
  const w = Math.hypot(CL.x - CR.x, CL.y - CR.y);
  return w ? refMm / w : null;
}

/** Tolerancias orientativas; el profesional interpreta el resultado. */
export const COMMISSURE_TILT_TOL_DEG = 2;
export const MIDLINE_DEV_TOL_MM = 2;
export const MIDLINE_DEV_TOL_PCT = 4;

type Pts = Partial<Record<string, CephPoint>>;

export interface SmilePhotoMetric {
  label: string;
  value: string;
  message: string;
  tone: 'ok' | 'out';
}

export interface SmilePhotoResult {
  metrics: SmilePhotoMetric[];
  /** Sugerencia para «Plano oclusal (cant)»; solo se aplica si el profesional la acepta. */
  cant: '' | 'Sin inclinación' | 'Inclinado a la derecha' | 'Inclinado a la izquierda';
  summary: string;
}

const fmt = (v: number, d = 1) => String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',');

/** Desplazamiento de p respecto de ref sobre el eje bicomisural (positivo hacia la comisura izquierda). */
function alongAxis(cr: CephPoint, cl: CephPoint, ref: CephPoint, p: CephPoint) {
  const len = Math.hypot(cl.x - cr.x, cl.y - cr.y) || 1;
  return ((p.x - ref.x) * (cl.x - cr.x) + (p.y - ref.y) * (cl.y - cr.y)) / len;
}

export function smilePhotoAnalysis(p: Pts, refMm?: number, extra: string[] = []): SmilePhotoResult {
  const metrics: SmilePhotoMetric[] = [];
  const summary: string[] = [];
  let cant: SmilePhotoResult['cant'] = '';
  const { Md, CR, CL, Mf } = p;
  if (!CR || !CL) return { metrics, cant, summary: '' };

  const widthPx = Math.hypot(CL.x - CR.x, CL.y - CR.y);
  const mmPerPx = refMm && refMm > 0 && widthPx ? refMm / widthPx : null;
  const dist = (px: number) => (mmPerPx ? `${fmt(px * mmPerPx)} mm` : `${fmt((px / widthPx) * 100)} %`);
  const within = (px: number) => (mmPerPx ? px * mmPerPx <= MIDLINE_DEV_TOL_MM : (px / widthPx) * 100 <= MIDLINE_DEV_TOL_PCT);
  const tolText = mmPerPx ? `tolerancia ${MIDLINE_DEV_TOL_MM} mm` : `tolerancia ${MIDLINE_DEV_TOL_PCT} % del ancho bicomisural`;

  const tilt = (Math.atan2(CL.y - CR.y, CL.x - CR.x) * 180) / Math.PI;
  const lowSide = CR.y > CL.y ? 'derecha' : 'izquierda';
  const tiltOk = Math.abs(tilt) <= COMMISSURE_TILT_TOL_DEG;
  cant = tiltOk ? 'Sin inclinación' : lowSide === 'derecha' ? 'Inclinado a la derecha' : 'Inclinado a la izquierda';
  metrics.push({
    label: 'Inclinación bicomisural',
    value: `${fmt(Math.abs(tilt))}°`,
    message: tiltOk ? `Horizontal · tolerancia ${COMMISSURE_TILT_TOL_DEG}°` : `Comisura ${lowSide} más baja · tolerancia ${COMMISSURE_TILT_TOL_DEG}°`,
    tone: tiltOk ? 'ok' : 'out',
  });
  summary.push(tiltOk ? 'línea bicomisural horizontal' : `línea bicomisural inclinada ${fmt(Math.abs(tilt))}° (comisura ${lowSide} más baja)`);

  metrics.push({
    label: 'Ancho intercomisural',
    value: mmPerPx ? `${fmt(widthPx * mmPerPx)} mm` : `${Math.round(widthPx)} px`,
    message: mmPerPx ? 'Calibrado con la distancia real' : 'Sin calibrar: ingrese la distancia real para ver mm',
    tone: 'ok',
  });

  const side = (d: number) => (d < 0 ? 'derecha' : 'izquierda');
  if (Md) {
    const center = { x: (CR.x + CL.x) / 2, y: (CR.y + CL.y) / 2 };
    const d = alongAxis(CR, CL, center, Md);
    const ok = within(Math.abs(d));
    metrics.push({
      label: 'Línea media dental vs. centro comisural',
      value: dist(Math.abs(d)),
      message: ok ? `Centrada · ${tolText}` : `Desviada a la ${side(d)} · ${tolText}`,
      tone: ok ? 'ok' : 'out',
    });
    if (Mf) {
      const f = alongAxis(CR, CL, Mf, Md);
      const fOk = within(Math.abs(f));
      metrics.push({
        label: 'Línea media dental vs. facial',
        value: dist(Math.abs(f)),
        message: fOk ? `Coincidentes · ${tolText}` : `Dental desviada a la ${side(f)} · ${tolText}`,
        tone: fOk ? 'ok' : 'out',
      });
      summary.push(fOk ? 'línea media dental coincidente con la facial' : `línea media dental desviada ${dist(Math.abs(f))} a la ${side(f)} respecto a la facial`);
    } else {
      summary.push(ok ? 'línea media dental centrada entre comisuras' : `línea media dental desviada ${dist(Math.abs(d))} a la ${side(d)} del centro comisural`);
    }
  }
  summary.push(...extra);
  return { metrics, cant, summary: summary.length ? `Análisis fotográfico de sonrisa: ${summary.join('; ')}.` : '' };
}

/** Recta perpendicular al eje bicomisural que pasa por p, extendida a lo alto de la imagen. */
export function perpendicularThrough(cr: CephPoint, cl: CephPoint, p: CephPoint, h: number) {
  const len = Math.hypot(cl.x - cr.x, cl.y - cr.y) || 1;
  const nx = -(cl.y - cr.y) / len;
  const ny = (cl.x - cr.x) / len;
  return { x1: p.x - nx * h, y1: p.y - ny * h, x2: p.x + nx * h, y2: p.y + ny * h };
}
