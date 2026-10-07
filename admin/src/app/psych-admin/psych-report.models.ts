export interface PsychReportPatient {
  fullName: string;
  documentType: string;
  documentNumber: string;
  age: string;
  birthDate: string;
  phone: string;
  institution: string;
}

export interface PsychReportProfessional {
  fullName: string;
  title: string;
  card: string;
}

export interface PsychReportData {
  clinicName: string;
  reportNumber: string;
  issuedAt: string;
  patient: PsychReportPatient;
  reason: string;
  findings: string;
  conclusions: string;
  professional: PsychReportProfessional;
}

export interface PsychReportDraft {
  patientId: string | null;
  data: PsychReportData;
}

export interface PsychReportSaved extends PsychReportDraft {
  id: string;
  patientName: string;
  reportNumber: string;
  hasSignature: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PsychReportListItem {
  id: string;
  patientId: string | null;
  patientName: string;
  reportNumber: string;
  createdAt: string;
  updatedAt: string;
}

export const REPORT_TEXT_MAX = 20000;
export const REPORT_FOOTER = 'Documento confidencial · Uso según finalidad autorizada';
export const REPORT_EXPORT_FORMAT = 'habilisalud.informe-psicologico';
export const SIGNATURE_MAX_DATAURL = 800 * 1024;

/** Límites de longitud (iguales a los del servidor). */
const LIMITS = {
  clinicName: 160,
  reportNumber: 40,
  patient: { fullName: 160, documentType: 60, documentNumber: 40, age: 30, phone: 40, institution: 200 },
  professional: { fullName: 160, title: 160, card: 80 },
} as const;

export const emptyReport = (clinicName = ''): PsychReportData => ({
  clinicName,
  reportNumber: '',
  issuedAt: '',
  patient: { fullName: '', documentType: '', documentNumber: '', age: '', birthDate: '', phone: '', institution: '' },
  reason: '',
  findings: '',
  conclusions: '',
  professional: { fullName: '', title: '', card: '' },
});

/** ¿El informe tiene información diligenciada? (el nombre del consultorio no cuenta). */
export function reportHasContent(d: PsychReportData, signature: string | null): boolean {
  const values = [d.reportNumber, d.issuedAt, d.reason, d.findings, d.conclusions, ...Object.values(d.patient), ...Object.values(d.professional)];
  return !!signature || values.some((v) => String(v || '').trim() !== '');
}

/** Edad cumplida a la fecha indicada: «N años» o, en menores de un año, «N meses». */
export function ageAt(birth: string, at: string): string {
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth || '');
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(at || '');
  if (!b || !a) return '';
  let months = (Number(a[1]) - Number(b[1])) * 12 + (Number(a[2]) - Number(b[2]));
  if (Number(a[3]) < Number(b[3])) months -= 1;
  if (months < 0) return '';
  if (months < 12) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? 'año' : 'años'}`;
}

export function datePieces(v: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  return m ? { d: m[3], m: m[2], y: m[1] } : { d: '', m: '', y: '' };
}

export function fmtDate(v: string): string {
  const p = datePieces(v);
  return p.y ? `${p.d}/${p.m}/${p.y}` : '';
}

export function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

/**
 * Lee un archivo exportado con «Exportar datos». Solo acepta este formato; recorta textos al
 * máximo permitido y descarta cualquier campo desconocido.
 */
export function parseReportExport(text: string): { data: PsychReportData; signature: string | null } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  const root = raw as { format?: unknown; data?: Record<string, unknown>; signature?: unknown };
  if (!root || root.format !== REPORT_EXPORT_FORMAT || typeof root.data !== 'object' || !root.data) {
    throw new Error('El archivo no corresponde a un informe psicológico exportado desde HabiliSalud.');
  }
  const d = root.data;
  const p = (d['patient'] || {}) as Record<string, unknown>;
  const pro = (d['professional'] || {}) as Record<string, unknown>;
  const data: PsychReportData = {
    clinicName: str(d['clinicName'], LIMITS.clinicName),
    reportNumber: str(d['reportNumber'], LIMITS.reportNumber),
    issuedAt: date(d['issuedAt']),
    patient: {
      fullName: str(p['fullName'], LIMITS.patient.fullName),
      documentType: str(p['documentType'], LIMITS.patient.documentType),
      documentNumber: str(p['documentNumber'], LIMITS.patient.documentNumber),
      age: str(p['age'], LIMITS.patient.age),
      birthDate: date(p['birthDate']),
      phone: str(p['phone'], LIMITS.patient.phone),
      institution: str(p['institution'], LIMITS.patient.institution),
    },
    reason: str(d['reason'], REPORT_TEXT_MAX),
    findings: str(d['findings'], REPORT_TEXT_MAX),
    conclusions: str(d['conclusions'], REPORT_TEXT_MAX),
    professional: {
      fullName: str(pro['fullName'], LIMITS.professional.fullName),
      title: str(pro['title'], LIMITS.professional.title),
      card: str(pro['card'], LIMITS.professional.card),
    },
  };
  const sig = root.signature;
  const signature =
    typeof sig === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(sig) && sig.length <= SIGNATURE_MAX_DATAURL ? sig : null;
  return { data, signature };
}
