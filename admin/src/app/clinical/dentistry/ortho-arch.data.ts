/** Tipos y normalización del análisis de arcadas (livianos: se cargan con la historia). */
export type ArchKey = 'upper' | 'lower';

export interface ArchMeasures {
  form: string;
  intercanine: string;
  intermolar: string;
  /** Profundidad: del punto incisal a la línea que une los primeros molares (mm). */
  depth: string;
  /** Perímetro disponible de mesial de 6 a mesial de 6 (mm). */
  perimeter: string;
  /** Espacio requerido digitado cuando no se miden los dientes uno a uno. */
  requiredManual: string;
  symmetry: string;
  notes: string;
}

export interface OrthoArchData {
  upper: ArchMeasures;
  lower: ArchMeasures;
  /** Ancho mesiodistal por diente FDI (mm). */
  widths: Record<string, string>;
  transverse: { maxillaryCompression: string; mandibularCompression: string; asymmetry: string; notes: string };
  sagittal: { classification: string; incisorRelation: string; notes: string };
  vertical: { pattern: string; notes: string };
}

const emptyArch = (): ArchMeasures => ({
  form: '',
  intercanine: '',
  intermolar: '',
  depth: '',
  perimeter: '',
  requiredManual: '',
  symmetry: '',
  notes: '',
});

export function emptyOrthoArch(): OrthoArchData {
  return {
    upper: emptyArch(),
    lower: emptyArch(),
    widths: {},
    transverse: { maxillaryCompression: '', mandibularCompression: '', asymmetry: '', notes: '' },
    sagittal: { classification: '', incisorRelation: '', notes: '' },
    vertical: { pattern: '', notes: '' },
  };
}

export function normalizeOrthoArch(raw: Partial<OrthoArchData> | undefined): OrthoArchData {
  const b = emptyOrthoArch();
  const r = raw || {};
  return {
    upper: { ...b.upper, ...(r.upper || {}) },
    lower: { ...b.lower, ...(r.lower || {}) },
    widths: { ...(r.widths || {}) },
    transverse: { ...b.transverse, ...(r.transverse || {}) },
    sagittal: { ...b.sagittal, ...(r.sagittal || {}) },
    vertical: { ...b.vertical, ...(r.vertical || {}) },
  };
}

