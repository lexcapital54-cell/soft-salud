import { procedureTypeLabel } from '../aesthetic.models';
import { AesAnnotation, AesProcedure, isProcedureMark, markStatus } from '../aesthetic-tracking.models';
import { MarkSymbol } from './facial-map.config';

export const VB_W = 200;
export const VB_H = 260;
/** Vértices máximos por trazo (el servidor rechaza más). */
export const MAX_POINTS = 240;

const round = (v: number) => Math.round(v * 10) / 10;
export const clampX = (v: number) => round(Math.min(VB_W, Math.max(0, v)));
export const clampY = (v: number) => round(Math.min(VB_H, Math.max(0, v)));

/** Cantidad digitada → número (acepta coma decimal); null si no es un número válido. */
export function parseQty(v: string | undefined): number | null {
  const s = (v ?? '').trim().replace(',', '.');
  if (!s || !/^\d{1,6}(\.\d{1,3})?$/.test(s)) return null;
  return Number(s);
}

export function fmtQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, '').replace('.', ',');
}

export interface TotalRow {
  procType: string;
  label: string;
  product: string;
  unit: string;
  planned: number;
  performed: number;
  marks: number;
}

/**
 * Totales por procedimiento, producto y unidad. Solo suma la misma unidad textual; nunca
 * convierte entre productos ni unidades. Suspendidas y canceladas no cuentan.
 */
export function mapTotals(marks: AesAnnotation[], procedures: AesProcedure[]): TotalRow[] {
  const procs = new Map(procedures.map((p) => [p.id, p]));
  const rows = new Map<string, TotalRow>();
  for (const a of marks) {
    const status = markStatus(a);
    if (status !== 'PLANEADO' && status !== 'REALIZADO') continue;
    const qty = parseQty(a.quantity);
    const linked = procs.get(a.procedureId);
    const procType = a.procType || linked?.type || '';
    const product = linked?.product.name.trim() || '';
    const unit = (a.unit || '').trim();
    const key = `${procType}|${product}|${unit}`;
    const row = rows.get(key) ?? {
      procType,
      label: procType ? procedureTypeLabel(procType) : 'Procedimiento sin tipo',
      product,
      unit,
      planned: 0,
      performed: 0,
      marks: 0,
    };
    row.marks += 1;
    if (qty !== null) {
      if (status === 'PLANEADO') row.planned += qty;
      else row.performed += qty;
    }
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.label.localeCompare(b.label) || a.unit.localeCompare(b.unit));
}

/** Diferencias entre lo marcado como realizado y la cantidad del registro de procedimiento. */
export function discrepancies(marks: AesAnnotation[], procedures: AesProcedure[]): string[] {
  const out: string[] = [];
  for (const p of procedures) {
    const linked = marks.filter((a) => a.procedureId === p.id && markStatus(a) === 'REALIZADO');
    if (!linked.length) continue;
    const unit = p.unit.trim();
    const total = parseQty(p.quantity);
    const same = linked.filter((a) => (a.unit || '').trim() === unit && parseQty(a.quantity) !== null);
    const other = linked.filter((a) => parseQty(a.quantity) !== null && (a.unit || '').trim() !== unit);
    const label = `${procedureTypeLabel(p.type)} del ${p.date || 'registro sin fecha'}`;
    if (other.length) {
      out.push(`${label}: ${other.length} marca(s) con una unidad distinta a la del registro (${unit || 'sin unidad'}); no se suman.`);
    }
    if (total !== null && same.length) {
      const sum = same.reduce((acc, a) => acc + (parseQty(a.quantity) ?? 0), 0);
      if (Math.abs(sum - total) > 1e-9) {
        out.push(`${label}: las marcas suman ${fmtQty(sum)} ${unit} y el registro indica ${fmtQty(total)} ${unit}.`);
      }
    }
  }
  return out;
}

/** Marcas realizadas a las que les falta información para trazabilidad. */
export function pendingMarks(marks: AesAnnotation[]) {
  return marks.filter((a) => {
    if (markStatus(a) !== 'REALIZADO') return false;
    return !a.procedureId || (!!a.quantity && parseQty(a.quantity) === null) || (!!a.quantity && !a.unit);
  });
}

/** Simplificación Ramer–Douglas–Peucker sobre vértices planos [x, y, …]. */
export function simplify(flat: number[], epsilon = 0.6): number[] {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
  if (pts.length <= 2) return flat.slice();
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [x1, y1] = pts[s];
    const [x2, y2] = pts[e];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((y2 - y1) * pts[i][0] - (x2 - x1) * pts[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > epsilon) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  let out = pts.filter((_, i) => keep[i]);
  if (out.length > MAX_POINTS / 2) {
    const step = out.length / (MAX_POINTS / 2);
    out = Array.from({ length: MAX_POINTS / 2 }, (_, i) => out[Math.min(out.length - 1, Math.round(i * step))]);
  }
  return out.flatMap(([x, y]) => [round(x), round(y)]);
}

export function polyline(flat: number[], close = false): string {
  let d = '';
  for (let i = 0; i + 1 < flat.length; i += 2) d += `${i ? 'L' : 'M'}${flat[i]},${flat[i + 1]} `;
  return close ? `${d}Z` : d.trim();
}

/** Punta de flecha al final del segmento (x1,y1)→(x2,y2). */
export function arrowHead(flat: number[], size = 5): string {
  const [x1, y1, x2, y2] = flat;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const a1 = ang + Math.PI * 0.85;
  const a2 = ang - Math.PI * 0.85;
  return `${x2},${y2} ${round(x2 + size * Math.cos(a1))},${round(y2 + size * Math.sin(a1))} ${round(x2 + size * Math.cos(a2))},${round(y2 + size * Math.sin(a2))}`;
}

/** Trazado del símbolo centrado en (x, y) con radio r. */
export function symbolPath(symbol: MarkSymbol, x: number, y: number, r: number): string {
  const poly = (n: number, rot: number, rr = r) =>
    Array.from({ length: n }, (_, i) => {
      const a = rot + (i * 2 * Math.PI) / n;
      return `${i ? 'L' : 'M'}${round(x + rr * Math.cos(a))},${round(y + rr * Math.sin(a))}`;
    }).join(' ') + ' Z';
  switch (symbol) {
    case 'diamond':
      return poly(4, -Math.PI / 2, r * 1.2);
    case 'square':
      return poly(4, Math.PI / 4, r * 1.25);
    case 'hexagon':
      return poly(6, 0, r * 1.1);
    case 'triangle':
      return poly(3, -Math.PI / 2, r * 1.35);
    case 'pentagon':
      return poly(5, -Math.PI / 2, r * 1.15);
    case 'star': {
      const pts = Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.62 : r * 1.35;
        return `${i ? 'L' : 'M'}${round(x + rr * Math.cos(a))},${round(y + rr * Math.sin(a))}`;
      });
      return `${pts.join(' ')} Z`;
    }
    default:
      return `M${x - r},${y} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 ${-r * 2},0 Z`;
  }
}

/** Desplaza una marca completa sin salirse del lienzo. */
export function translateMark(a: AesAnnotation, dx: number, dy: number) {
  if (a.points?.length) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i + 1 < a.points.length; i += 2) {
      minX = Math.min(minX, a.points[i]);
      maxX = Math.max(maxX, a.points[i]);
      minY = Math.min(minY, a.points[i + 1]);
      maxY = Math.max(maxY, a.points[i + 1]);
    }
    dx = Math.min(VB_W - maxX, Math.max(-minX, dx));
    dy = Math.min(VB_H - maxY, Math.max(-minY, dy));
    a.points = a.points.map((v, i) => round(v + (i % 2 ? dy : dx)));
  }
  a.x = clampX(a.x + dx);
  a.y = clampY(a.y + dy);
}

/**
 * Deshacer/rehacer solo afecta borradores: las marcas cerradas se conservan como están
 * ahora aunque la instantánea sea anterior a su cierre.
 */
export function restoreSnapshot(snapshot: AesAnnotation[], current: AesAnnotation[]): AesAnnotation[] {
  const locked = new Map(current.filter((a) => a.lockedAt).map((a) => [a.id, a]));
  const out = snapshot.map((a) => locked.get(a.id) ?? a);
  for (const a of current) if (a.lockedAt && !out.some((b) => b.id === a.id)) out.push(a);
  return out;
}

/** Copia de una marca como registro nuevo (sin auditoría ni cierre). */
export function duplicateMark(a: AesAnnotation, id: string, date: string): AesAnnotation {
  const copy = JSON.parse(JSON.stringify(a)) as AesAnnotation;
  delete copy.lockedAt;
  delete copy.lockedBy;
  delete copy._audit;
  delete copy.close;
  copy.id = id;
  copy.date = date;
  if (isProcedureMark(copy)) {
    copy.kind = 'PROCEDIMIENTO';
    copy.status = 'PLANEADO';
  }
  translateMark(copy, 4, 4);
  return copy;
}
