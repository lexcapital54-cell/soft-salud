/** Resumen automático del tratamiento de ortodoncia a partir de la historia y los controles firmados. */

type Json = Record<string, unknown>;

export interface EpicrisisEvolution {
  signedAt: Date | null;
  clinicalAttentionDate?: Date | null;
  content: unknown;
}

export interface OrthoEpicrisisSummary {
  initialDiagnoses: Array<{ code: string; description: string; primary: boolean }>;
  orthoDiagnosis: string;
  skeletalClass: string;
  objectives: string;
  appliance: string;
  extractions: string;
  startDate: Date | null;
  endDate: Date | null;
  months: number | null;
  controls: number;
  lastPhase: string;
  cups: Array<{ code: string; description: string; count: number }>;
  retention: { status: string; plan: string; controls: number; lastControl: Date | null };
  closure: { closedAt: string; caseStatus: string; treatmentResult: string };
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function buildOrthoEpicrisis(
  recordContent: unknown,
  diagnoses: Array<{ cieCode: string; description: string | null; isPrimary: boolean }>,
  evolutions: EpicrisisEvolution[],
): OrthoEpicrisisSummary {
  const content = (recordContent ?? {}) as Json;
  const dental = (content.dentistry ?? {}) as Json;
  const ortho = (dental.orthodontics ?? {}) as Json;
  const ceph = (ortho.cephalometry ?? {}) as Json;
  const closure = (dental.closure ?? {}) as Json;

  const initialDiagnoses = diagnoses.length
    ? [...diagnoses]
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .map((d) => ({ code: d.cieCode, description: d.description || '', primary: d.isPrimary }))
    : ((dental.diagnoses as Json[] | undefined) ?? [])
        .filter((d) => str(d.cieCode))
        .map((d, i) => ({ code: str(d.cieCode), description: str(d.description), primary: i === 0 }));

  const sorted = [...evolutions].sort(
    (a, b) =>
      (a.clinicalAttentionDate ?? a.signedAt ?? new Date(0)).getTime() -
      (b.clinicalAttentionDate ?? b.signedAt ?? new Date(0)).getTime(),
  );
  let startDate: Date | null = null;
  let endDate: Date | null = null;
  let controls = 0;
  let retentionControls = 0;
  let lastRetention: Date | null = null;
  let lastPhase = str(ortho.phase);
  const cups = new Map<string, { code: string; description: string; count: number }>();
  for (const ev of sorted) {
    const c = ((ev.content ?? {}) as Json).orthoControl as Json | undefined;
    if (!c) continue;
    const at = ev.clinicalAttentionDate ?? ev.signedAt;
    controls++;
    if (c.event === 'INSTALACION') {
      startDate = at;
      endDate = null;
    }
    if (c.event === 'RETIRO') endDate = at;
    if (c.event === 'RETENCION') {
      retentionControls++;
      lastRetention = at;
    }
    if (str(c.phase)) lastPhase = str(c.phase);
    for (const item of (c.cups as Json[] | undefined) ?? []) {
      const code = str(item.code);
      if (!code) continue;
      const row = cups.get(code) ?? { code, description: str(item.description), count: 0 };
      row.count++;
      cups.set(code, row);
    }
  }
  const months =
    startDate ? Math.max(0, Math.round((((endDate ?? new Date()).getTime() - startDate.getTime()) / (30.44 * 86_400_000)) * 10) / 10) : null;

  const plan = str(ortho.retention);
  const status = !startDate
    ? 'Sin instalación de aparatología registrada.'
    : !endDate
      ? 'Tratamiento activo: la retención aún no ha iniciado.'
      : retentionControls
        ? `En retención: ${retentionControls} control(es) de retención.`
        : 'Aparatología retirada; retención indicada sin controles de retención registrados.';

  return {
    initialDiagnoses,
    orthoDiagnosis: str(ortho.diagnosis),
    skeletalClass: str(ceph.skeletalClass),
    objectives: str(ortho.objectives),
    appliance: str(ortho.appliance),
    extractions: str(ortho.extractions),
    startDate,
    endDate,
    months,
    controls,
    lastPhase,
    cups: [...cups.values()],
    retention: { status, plan, controls: retentionControls, lastControl: lastRetention },
    closure: {
      closedAt: str(closure.closedAt),
      caseStatus: str(closure.caseStatus),
      treatmentResult: str(closure.treatmentResult),
    },
  };
}
