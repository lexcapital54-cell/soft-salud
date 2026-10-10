/**
 * Seguimiento longitudinal estético por paciente (mapa facial y procedimientos).
 * Se guarda en `aesthetic_tracking`; las firmas, cierres y adendas los sella el servidor.
 */

export type AesView = 'FRONTAL' | 'DERECHO' | 'IZQUIERDO';

export const AES_VIEWS: Array<{ key: AesView; label: string }> = [
  { key: 'FRONTAL', label: 'Frontal' },
  { key: 'DERECHO', label: 'Perfil derecho' },
  { key: 'IZQUIERDO', label: 'Perfil izquierdo' },
];

export type AesMarkKind = 'TRATADA' | 'HALLAZGO' | 'PLAN' | 'EVENTO';

/** Colores con contraste AA sobre blanco para el punto y su texto. */
export const AES_MARK_KINDS: Array<{ key: AesMarkKind; label: string; color: string }> = [
  { key: 'TRATADA', label: 'Zona tratada', color: '#173B3A' },
  { key: 'HALLAZGO', label: 'Hallazgo', color: '#7A5A2C' },
  { key: 'PLAN', label: 'Zona planificada', color: '#3F6B5C' },
  { key: 'EVENTO', label: 'Evento adverso', color: '#A23B2C' },
];

export function markKind(key: string) {
  return AES_MARK_KINDS.find((k) => k.key === key) ?? AES_MARK_KINDS[1];
}

export interface AesAudit {
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface AesAnnotation {
  id: string;
  view: AesView;
  /** Coordenadas en el viewBox 200×260 de la vista. */
  x: number;
  y: number;
  zone: string;
  kind: AesMarkKind;
  date: string;
  procedureId: string;
  note: string;
  /** Solo de ida: pide al servidor cerrar la anotación. */
  close?: boolean;
  lockedAt?: string;
  lockedBy?: string;
  _audit?: AesAudit;
}

export interface AesProduct {
  name: string;
  brand: string;
  manufacturer: string;
  lot: string;
  expiry: string;
  invima: string;
  presentation: string;
}

export interface AesAddendum {
  id: string;
  text: string;
  at?: string;
  by?: string;
}

export type AesProcedureStatus = 'BORRADOR' | 'FIRMADO';

export interface AesProcedure {
  id: string;
  encounterId: string;
  date: string;
  type: string;
  zones: string[];
  zoneDetail: string;
  product: AesProduct;
  /** Cantidad y unidad las digita el profesional; el sistema no sugiere dosis. */
  quantity: string;
  unit: string;
  preparation: string;
  technique: string;
  device: string;
  parameters: string;
  anesthesia: string;
  asepsis: string;
  incidents: string;
  tolerance: '' | 'BUENA' | 'REGULAR' | 'MALA';
  adverseEvents: string;
  instructions: string;
  nextControl: string;
  consentRef: string;
  notes: string;
  status: AesProcedureStatus;
  signedAt?: string;
  signedBy?: string;
  addenda: AesAddendum[];
  _audit?: AesAudit;
}

export type AesPhotoAngle = 'FRONTAL' | 'PERFIL_DER' | 'PERFIL_IZQ' | 'OBLICUA_DER' | 'OBLICUA_IZQ' | 'DETALLE';
export type AesPhotoMoment = 'ANTES' | 'DESPUES' | 'CONTROL';

export const AES_PHOTO_ANGLES: Array<{ key: AesPhotoAngle; label: string }> = [
  { key: 'FRONTAL', label: 'Frontal' },
  { key: 'OBLICUA_DER', label: '45° derecho' },
  { key: 'PERFIL_DER', label: 'Perfil derecho' },
  { key: 'OBLICUA_IZQ', label: '45° izquierdo' },
  { key: 'PERFIL_IZQ', label: 'Perfil izquierdo' },
  { key: 'DETALLE', label: 'Detalle' },
];

export const AES_PHOTO_MOMENTS: Array<{ key: AesPhotoMoment; label: string }> = [
  { key: 'ANTES', label: 'Antes' },
  { key: 'DESPUES', label: 'Después' },
  { key: 'CONTROL', label: 'Control' },
];

/** Foto clínica clasificada; el archivo es un adjunto de la atención en que se subió. */
export interface AesPhoto {
  id: string;
  attachmentId: string;
  encounterId: string;
  angle: AesPhotoAngle;
  moment: AesPhotoMoment;
  date: string;
  procedureId: string;
  note: string;
  lockedAt?: string;
  lockedBy?: string;
  _audit?: AesAudit;
}

export interface AesTrackingData {
  annotations: AesAnnotation[];
  procedures: AesProcedure[];
  photos: AesPhoto[];
}

export function emptyTrackingData(): AesTrackingData {
  return { annotations: [], procedures: [], photos: [] };
}

/** Inyectables e implantables: producto, lote, cantidad y unidad son obligatorios al firmar. */
export const TRACEABLE_TYPES = new Set(['TOXINA', 'ACIDO_HIALURONICO', 'BIOESTIMULADOR', 'MESOTERAPIA', 'HILOS']);
/** Tecnologías y peelings: se registran equipo/agente y parámetros. */
export const DEVICE_TYPES = new Set(['LASER', 'ENERGIA', 'PEELING', 'MICRONEEDLING']);

export const AES_UNITS = ['U', 'mL', 'mg', 'viales', 'jeringas', 'hilos', 'pases', 'disparos', 'sesión', 'otra'];

export const TOLERANCE_LABEL: Record<Exclude<AesProcedure['tolerance'], ''>, string> = {
  BUENA: 'Buena',
  REGULAR: 'Regular',
  MALA: 'Mala',
};

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const num = (v: unknown, max: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
};

function audit(v: unknown): AesAudit | undefined {
  const a = obj(v);
  return Object.keys(a).length
    ? { createdAt: str(a['createdAt']), createdBy: str(a['createdBy']), updatedAt: str(a['updatedAt']), updatedBy: str(a['updatedBy']) }
    : undefined;
}

export function emptyProcedure(id: string, date: string, encounterId: string): AesProcedure {
  return {
    id,
    encounterId,
    date,
    type: '',
    zones: [],
    zoneDetail: '',
    product: { name: '', brand: '', manufacturer: '', lot: '', expiry: '', invima: '', presentation: '' },
    quantity: '',
    unit: '',
    preparation: '',
    technique: '',
    device: '',
    parameters: '',
    anesthesia: '',
    asepsis: '',
    incidents: '',
    tolerance: '',
    adverseEvents: '',
    instructions: '',
    nextControl: '',
    consentRef: '',
    notes: '',
    status: 'BORRADOR',
    addenda: [],
  };
}

export function normalizeProcedure(raw: unknown): AesProcedure {
  const r = obj(raw);
  const p = obj(r['product']);
  const base = emptyProcedure(str(r['id']), str(r['date']), str(r['encounterId']));
  const tolerance = str(r['tolerance']);
  return {
    ...base,
    type: str(r['type']),
    zones: Array.isArray(r['zones']) ? (r['zones'] as unknown[]).map(str).filter(Boolean) : [],
    zoneDetail: str(r['zoneDetail']),
    product: {
      name: str(p['name']),
      brand: str(p['brand']),
      manufacturer: str(p['manufacturer']),
      lot: str(p['lot']),
      expiry: str(p['expiry']),
      invima: str(p['invima']),
      presentation: str(p['presentation']),
    },
    quantity: str(r['quantity']),
    unit: str(r['unit']),
    preparation: str(r['preparation']),
    technique: str(r['technique']),
    device: str(r['device']),
    parameters: str(r['parameters']),
    anesthesia: str(r['anesthesia']),
    asepsis: str(r['asepsis']),
    incidents: str(r['incidents']),
    tolerance: tolerance === 'BUENA' || tolerance === 'REGULAR' || tolerance === 'MALA' ? tolerance : '',
    adverseEvents: str(r['adverseEvents']),
    instructions: str(r['instructions']),
    nextControl: str(r['nextControl']),
    consentRef: str(r['consentRef']),
    notes: str(r['notes']),
    status: r['status'] === 'FIRMADO' ? 'FIRMADO' : 'BORRADOR',
    ...(str(r['signedAt']) ? { signedAt: str(r['signedAt']), signedBy: str(r['signedBy']) } : {}),
    addenda: Array.isArray(r['addenda'])
      ? (r['addenda'] as unknown[]).map((a) => {
          const o = obj(a);
          return { id: str(o['id']), text: str(o['text']), at: str(o['at']), by: str(o['by']) };
        })
      : [],
    ...(audit(r['_audit']) ? { _audit: audit(r['_audit']) } : {}),
  };
}

export function normalizeAnnotation(raw: unknown): AesAnnotation {
  const r = obj(raw);
  const view = str(r['view']);
  const kind = str(r['kind']);
  return {
    id: str(r['id']),
    view: view === 'DERECHO' || view === 'IZQUIERDO' ? view : 'FRONTAL',
    x: num(r['x'], 200),
    y: num(r['y'], 260),
    zone: str(r['zone']),
    kind: AES_MARK_KINDS.some((k) => k.key === kind) ? (kind as AesMarkKind) : 'HALLAZGO',
    date: str(r['date']),
    procedureId: str(r['procedureId']),
    note: str(r['note']),
    ...(str(r['lockedAt']) ? { lockedAt: str(r['lockedAt']), lockedBy: str(r['lockedBy']) } : {}),
    ...(audit(r['_audit']) ? { _audit: audit(r['_audit']) } : {}),
  };
}

export function normalizePhoto(raw: unknown): AesPhoto {
  const r = obj(raw);
  const angle = str(r['angle']);
  const moment = str(r['moment']);
  return {
    id: str(r['id']),
    attachmentId: str(r['attachmentId']),
    encounterId: str(r['encounterId']),
    angle: AES_PHOTO_ANGLES.some((a) => a.key === angle) ? (angle as AesPhotoAngle) : 'FRONTAL',
    moment: AES_PHOTO_MOMENTS.some((m) => m.key === moment) ? (moment as AesPhotoMoment) : 'CONTROL',
    date: str(r['date']),
    procedureId: str(r['procedureId']),
    note: str(r['note']),
    ...(str(r['lockedAt']) ? { lockedAt: str(r['lockedAt']), lockedBy: str(r['lockedBy']) } : {}),
    ...(audit(r['_audit']) ? { _audit: audit(r['_audit']) } : {}),
  };
}

export function normalizeTracking(raw: unknown): AesTrackingData {
  const r = obj(raw);
  return {
    annotations: Array.isArray(r['annotations']) ? (r['annotations'] as unknown[]).map(normalizeAnnotation).filter((a) => a.id) : [],
    procedures: Array.isArray(r['procedures']) ? (r['procedures'] as unknown[]).map(normalizeProcedure).filter((p) => p.id) : [],
    photos: Array.isArray(r['photos'])
      ? (r['photos'] as unknown[]).map(normalizePhoto).filter((p) => p.id && p.attachmentId)
      : [],
  };
}

/** Datos que el servidor exige para firmar; se valida antes para dar un mensaje claro. */
export function missingForSign(p: AesProcedure): string[] {
  const missing: string[] = [];
  if (!p.date) missing.push('fecha');
  if (!p.type) missing.push('procedimiento');
  if (!p.zones.length && !p.zoneDetail.trim()) missing.push('zona tratada');
  if (TRACEABLE_TYPES.has(p.type)) {
    if (!p.product.name.trim()) missing.push('producto');
    if (!p.product.lot.trim()) missing.push('lote');
    if (!p.quantity.trim()) missing.push('cantidad');
    if (!p.unit.trim()) missing.push('unidad');
  }
  return missing;
}

/** Producto vencido a la fecha del procedimiento (fechas ISO yyyy-mm-dd). */
export function expiredAtProcedure(p: AesProcedure): boolean {
  return !!p.product.expiry && !!p.date && p.product.expiry < p.date;
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
