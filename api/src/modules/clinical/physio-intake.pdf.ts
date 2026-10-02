/**
 * Textos del PDF para la valoración interactiva de fisioterapia
 * (`physiotherapy.intake`): mapa corporal, terapias, valoración rápida y
 * antecedentes con casillas.
 */
type Rec = Record<string, unknown>;

const ZONE_NAMES: Record<string, string> = {
  cuello: 'Cuello',
  torax: 'Tórax',
  abdomen: 'Abdomen',
  cadera: 'Cadera',
  hombro: 'Hombro',
  brazo: 'Brazo',
  codo: 'Codo',
  antebrazo: 'Antebrazo',
  muneca: 'Muñeca',
  mano: 'Mano',
  muslo: 'Muslo',
  rodilla: 'Rodilla',
  pierna: 'Pierna',
  pantorrilla: 'Pantorrilla',
  tobillo: 'Tobillo',
  pie: 'Pie',
  cervical: 'Región cervical',
  dorsal: 'Región dorsal',
  escapula: 'Escápula',
  lumbar: 'Región lumbar',
  gluteo: 'Glúteo',
};
const FEMININE = new Set(['cadera', 'muneca', 'mano', 'rodilla', 'pierna', 'pantorrilla', 'escapula']);

const THERAPY_NAMES: Record<string, string> = {
  manualTherapy: 'Terapia manual',
  electrotherapy: 'Electroterapia (TENS / IFC)',
  ultrasound: 'Ultrasonido',
  therapeuticLaser: 'Láser terapéutico',
  magnetotherapy: 'Magnetoterapia',
  massageTherapy: 'Masoterapia',
  therapeuticExercise: 'Ejercicio terapéutico',
  lymphaticDrainage: 'Drenaje linfático',
  functionalTaping: 'Vendaje funcional',
  dryNeedling: 'Punción seca',
  hydrotherapy: 'Hidroterapia',
};

const LABELS: Record<string, string> = {
  NORMAL: 'Normal',
  ALTERADA: 'Alterada',
  COMPLETO: 'Completo',
  LIMITADO: 'Limitado',
  CONSERVADA: 'Conservada',
  DISMINUIDA: 'Disminuida',
  DIARIO: 'Diario',
  SEMANAL: 'Semanal',
  INTERMITENTE: 'Intermitente',
  MENSUAL: 'Mensual',
  REDES: 'Redes sociales',
  RECOMENDACION: 'Recomendación',
  CONVENIO_EPS: 'Convenio EPS',
  WEB: 'Página web',
};

const rec = (v: unknown): Rec => (v && typeof v === 'object' ? (v as Rec) : {});
const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** "ant:hombro_der" → "Hombro derecho (anterior)". */
export function physioZoneLabel(id: string): string {
  const m = /^(ant|post):([a-z]+?)(?:_(der|izq))?$/.exec(id);
  if (!m) return id;
  const [, view, key, side] = m;
  const name = ZONE_NAMES[key] ?? key;
  const lado = side ? ` ${side === 'der' ? 'derech' : 'izquierd'}${FEMININE.has(key) ? 'a' : 'o'}` : '';
  return `${name}${lado} (${view === 'ant' ? 'anterior' : 'posterior'})`;
}

function painText(raw: unknown): string {
  const m = String(raw ?? '').match(/\d+/);
  if (!m) return '';
  const n = Number(m[0]);
  if (n < 0 || n > 10) return '';
  const band = n === 0 ? 'sin dolor' : n <= 3 ? 'leve' : n <= 6 ? 'moderado' : 'severo';
  return `Dolor EVA: ${n}/10 (${band})`;
}

/** Secciones listas para el PDF; las vacías no se devuelven. */
export function physioIntakeSections(physio: Rec): {
  header: string;
  antecedents: string;
  zones: string;
  assessment: string;
  therapies: string;
} {
  const intake = rec(physio.intake);
  const detail = rec(physio.antecedentsDetail);
  const ant = rec(intake.antecedents);
  const pat = rec(ant.pathological);
  const sur = rec(ant.surgical);
  const tra = rec(ant.traumatic);
  const all = rec(ant.allergies);

  const group = (title: string, noRefers: unknown, marks: Array<string | false>, text: string) => {
    const items = [...marks.filter((x): x is string => !!x), text].filter(Boolean);
    if (items.length) return `${title}: ${items.join(', ')}`;
    return noRefers === true ? `${title}: No refiere` : '';
  };
  const antecedents = [
    group('Patológicos', pat.noRefers, [pat.diabetes === true && 'Diabetes', pat.hypertension === true && 'Hipertensión', pat.surgeries === true && 'Cirugías'], s(detail.pathological)),
    group('Quirúrgicos', sur.noRefers, [!!s(sur.date) && `Fecha ${s(sur.date)}`], s(detail.surgical)),
    group('Traumáticos', tra.noRefers, [tra.fractures === true && 'Fracturas', tra.sprains === true && 'Esguinces'], s(detail.traumatic)),
    group('Alergias', all.noRefers, [all.hasAllergies === true && 'Sí'], s(detail.allergic)),
    ...(
      [
        ['Personales', detail.personal],
        ['Farmacológicos', detail.pharmacological],
        ['Familiares', detail.family],
        ['Gineco-obstétricos', detail.obgyn],
        ['Ocupacionales', detail.occupational],
        ['Otros', detail.others],
      ] as Array<[string, unknown]>
    ).map(([k, v]) => (s(v) ? `${k}: ${s(v)}` : '')),
  ]
    .filter(Boolean)
    .join('\n');

  const choice = (title: string, value: unknown, notes: unknown) => {
    const parts = [LABELS[s(value)] ?? '', s(notes)].filter(Boolean);
    return parts.length ? `${title}: ${parts.join(' — ')}` : '';
  };
  const fa = rec(physio.functionalAssessment);
  const assessment = [
    choice('Postura', intake.posture, intake.postureNotes),
    choice('Rango de movimiento', intake.rangeOfMotion, intake.rangeNotes),
    choice('Fuerza muscular', intake.strength, intake.strengthNotes),
    painText(fa.pain),
    LABELS[s(intake.painFrequency)] ? `Frecuencia del dolor: ${LABELS[s(intake.painFrequency)]}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const zones = [list(intake.zones).map(physioZoneLabel).join(', '), s(intake.zonesNotes)].filter(Boolean).join('\n');
  const therapies = [...list(intake.therapies).map((k) => THERAPY_NAMES[k] ?? k), s(intake.therapiesOther)].filter(Boolean).join(', ');

  const source = s(intake.referralSource);
  const header = [
    source && `¿Cómo llegó a la consulta?: ${source === 'OTRO' ? `Otro${s(intake.referralOther) ? ` (${s(intake.referralOther)})` : ''}` : LABELS[source] ?? source}`,
    s(intake.assessmentDate) && `Fecha de valoración: ${s(intake.assessmentDate)}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return { header, antecedents, zones, assessment, therapies };
}
