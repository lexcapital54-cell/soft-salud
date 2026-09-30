/** Modelos digitales de ortodoncia (livianos: se cargan con la historia). */
export interface DigitalModelRow {
  id: string;
  kind: string;
  format: string;
  date: string;
  version: number;
  attachmentId: string;
  fileName: string;
  sizeKb: number;
  source: string;
  notes: string;
}

export const DIGITAL_MODEL_KINDS = ['Modelo superior', 'Modelo inferior', 'Oclusión (registro)', 'Set completo'];
export const DIGITAL_MODEL_SOURCES = ['Escáner intraoral', 'Modelo de yeso escaneado', 'Laboratorio', 'Otro'];

export function normalizeDigitalModels(raw: unknown): DigitalModelRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && typeof r === 'object')
    .map((r, i) => {
      const o = r as Partial<DigitalModelRow>;
      return {
        id: o.id || `dm-${i}-${Date.now().toString(36)}`,
        kind: o.kind || '',
        format: o.format || '',
        date: o.date || '',
        version: Number(o.version) || 1,
        attachmentId: o.attachmentId || '',
        fileName: o.fileName || '',
        sizeKb: Number(o.sizeKb) || 0,
        source: o.source || '',
        notes: o.notes || '',
      };
    });
}
