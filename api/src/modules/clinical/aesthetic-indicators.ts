/**
 * Indicadores agregados de medicina estética. Solo devuelve conteos: ningún
 * nombre, documento ni dato que identifique a un paciente.
 */

export interface IndicatorPatient {
  id: string;
  birthDate: Date | null;
  sexAtBirth: string | null;
  createdAt: Date;
}

export interface IndicatorEncounter {
  id: string;
  patientId: string;
  professionalId: string;
  at: Date;
  signed: boolean;
  aesthetic: unknown;
}

export interface IndicatorTracking {
  patientId: string;
  data: unknown;
}

export interface IndicatorAppointment {
  status: string;
  serviceName: string | null;
}

export interface IndicatorInput {
  /** Fechas YYYY-MM-DD (hora de Bogotá), ambas incluidas. */
  from: string;
  to: string;
  today: string;
  patients: IndicatorPatient[];
  encounters: IndicatorEncounter[];
  tracking: IndicatorTracking[];
  appointments: IndicatorAppointment[];
  consentsSigned: number;
  /** Si se filtra por profesional, solo cuentan los procedimientos de sus atenciones. */
  encounterFilter?: Set<string>;
}

type Count = { key: string; count: number };

const AGE_RANGES: Array<{ key: string; min: number; max: number }> = [
  { key: 'Menor de 18', min: 0, max: 17 },
  { key: '18 a 29', min: 18, max: 29 },
  { key: '30 a 39', min: 30, max: 39 },
  { key: '40 a 49', min: 40, max: 49 },
  { key: '50 a 59', min: 50, max: 59 },
  { key: '60 o más', min: 60, max: 200 },
];

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

function tally(values: string[]): Count[] {
  const map = new Map<string, number>();
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
  return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Fecha calendario en Bogotá (UTC-5, sin horario de verano). */
export function bogotaDay(d: Date): string {
  return new Date(d.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
}

export function ageAt(birth: Date, day: string): number {
  const b = birth.toISOString().slice(0, 10);
  const [by, bm, bd] = b.split('-').map(Number);
  const [y, m, d] = day.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

export function sexLabel(raw: string | null): string {
  const s = (raw || '').trim().toUpperCase();
  if (s.startsWith('F') || s === 'MUJER') return 'Femenino';
  if (s.startsWith('M') && s !== 'MUJER') return 'Masculino';
  if (s.startsWith('I')) return 'Intersexual';
  return 'Sin dato';
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function buildAestheticIndicators(input: IndicatorInput) {
  const { from, to, today } = input;
  const inRange = (day: string) => isDay(day) && day >= from && day <= to;

  // Procedimientos del seguimiento por paciente (la fecha es la del procedimiento).
  type Proc = { patientId: string; date: string; type: string; zones: string[]; signed: boolean; adverse: boolean; nextControl: string };
  const allProcs: Proc[] = [];
  for (const t of input.tracking) {
    for (const raw of list(obj(t.data).procedures)) {
      const p = obj(raw);
      if (input.encounterFilter && !input.encounterFilter.has(str(p.encounterId))) continue;
      allProcs.push({
        patientId: t.patientId,
        date: str(p.date),
        type: str(p.type) || 'OTRO',
        zones: list(p.zones).map(str).filter(Boolean),
        signed: p.status === 'FIRMADO',
        adverse: !!str(p.adverseEvents),
        nextControl: str(p.nextControl),
      });
    }
  }
  const procs = allProcs.filter((p) => inRange(p.date));

  // Controles: el último control indicado por paciente, si no ha vuelto a tener procedimiento desde entonces.
  const lastByPatient = new Map<string, string>();
  for (const p of allProcs) if (isDay(p.date) && p.date > (lastByPatient.get(p.patientId) ?? '')) lastByPatient.set(p.patientId, p.date);
  const horizon = addDays(today, 30);
  let upcomingControls = 0;
  let overdueControls = 0;
  const pendingByPatient = new Map<string, string>();
  for (const p of allProcs) {
    if (!isDay(p.nextControl)) continue;
    if ((lastByPatient.get(p.patientId) ?? '') >= p.nextControl) continue;
    const prev = pendingByPatient.get(p.patientId);
    if (!prev || p.nextControl > prev) pendingByPatient.set(p.patientId, p.nextControl);
  }
  for (const day of pendingByPatient.values()) {
    if (day < today) overdueControls++;
    else if (day <= horizon) upcomingControls++;
  }

  const encounters = input.encounters.filter((e) => inRange(bogotaDay(e.at)));
  const attended = new Set<string>([...encounters.map((e) => e.patientId), ...procs.map((p) => p.patientId)]);

  // Valoración: la más reciente del periodo por paciente.
  const latest = new Map<string, IndicatorEncounter>();
  for (const e of encounters) {
    const prev = latest.get(e.patientId);
    if (!prev || e.at > prev.at) latest.set(e.patientId, e);
  }
  const fitz: string[] = [];
  const glogau: string[] = [];
  const skin: string[] = [];
  for (const e of latest.values()) {
    const a = obj(obj(e.aesthetic).assessment);
    fitz.push(str(a.fitzpatrick) || 'Sin dato');
    glogau.push(str(a.glogau) || 'Sin dato');
    skin.push(str(a.skinType) || 'Sin dato');
  }

  const patientsById = new Map(input.patients.map((p) => [p.id, p]));
  const ages: string[] = [];
  const sexes: string[] = [];
  for (const id of attended) {
    const p = patientsById.get(id);
    if (!p) continue;
    sexes.push(sexLabel(p.sexAtBirth));
    if (!p.birthDate) {
      ages.push('Sin dato');
      continue;
    }
    const age = ageAt(p.birthDate, to);
    ages.push(AGE_RANGES.find((r) => age >= r.min && age <= r.max)?.key ?? 'Sin dato');
  }
  const order = [...AGE_RANGES.map((r) => r.key), 'Sin dato'];
  const ageRanges = order.map((key) => ({ key, count: ages.filter((a) => a === key).length })).filter((r) => r.count || r.key !== 'Sin dato');

  const months = new Map<string, { encounters: number; procedures: number }>();
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addDays(`${m}-28`, 7).slice(0, 7)) months.set(m, { encounters: 0, procedures: 0 });
  for (const e of encounters) {
    const row = months.get(bogotaDay(e.at).slice(0, 7));
    if (row) row.encounters++;
  }
  for (const p of procs) {
    const row = months.get(p.date.slice(0, 7));
    if (row) row.procedures++;
  }

  return {
    period: { from, to },
    totals: {
      patients: input.patients.length,
      newPatients: input.patients.filter((p) => inRange(bogotaDay(p.createdAt))).length,
      attendedPatients: attended.size,
      encounters: encounters.length,
      signedRecords: encounters.filter((e) => e.signed).length,
      procedures: procs.length,
      signedProcedures: procs.filter((p) => p.signed).length,
      adverseEvents: procs.filter((p) => p.adverse).length,
      upcomingControls,
      overdueControls,
      consentsSigned: input.consentsSigned,
      appointments: input.appointments.length,
    },
    procedureTypes: tally(procs.map((p) => p.type)),
    zones: tally(procs.flatMap((p) => p.zones)).slice(0, 10),
    fitzpatrick: tally(fitz),
    glogau: tally(glogau),
    skinTypes: tally(skin),
    ageRanges,
    sex: tally(sexes),
    appointmentStatus: tally(input.appointments.map((a) => a.status)),
    topServices: tally(input.appointments.map((a) => a.serviceName).filter((s): s is string => !!s)).slice(0, 8),
    monthly: [...months.entries()].map(([month, v]) => ({ month, ...v })),
  };
}

export type AestheticIndicators = ReturnType<typeof buildAestheticIndicators>;
