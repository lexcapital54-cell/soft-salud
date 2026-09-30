/** Tipos y normalización de la tabla cefalométrica (livianos: se cargan con la historia). */
export interface CephRowValue {
  value: string;
  norm: string;
  sd: string;
  note: string;
}

export interface OrthoCephData {
  analysis: string;
  rows: Record<string, CephRowValue>;
  notes: string;
}

export function emptyOrthoCeph(): OrthoCephData {
  return { analysis: '', rows: {}, notes: '' };
}

export function normalizeOrthoCeph(raw: Partial<OrthoCephData> | undefined): OrthoCephData {
  const r = raw || {};
  const rows: Record<string, CephRowValue> = {};
  for (const [k, v] of Object.entries(r.rows || {}) as Array<[string, Partial<CephRowValue> | undefined]>) {
    rows[k] = { value: v?.value || '', norm: v?.norm || '', sd: v?.sd || '', note: v?.note || '' };
  }
  return { analysis: r.analysis || '', rows, notes: r.notes || '' };
}
