/**
 * Secciones del PDF de la historia clínica de medicina estética (HC-AES).
 * Los rótulos replican `admin/src/app/clinical/aesthetic/*.models.ts`; solo se
 * imprime lo diligenciado y nunca se recorta el texto clínico.
 */

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

const ANSWER: Record<string, string> = { SI: 'Sí', NO: 'No', DESCONOCIDO: 'Desconocido', NA: 'No aplica' };

const CONDITIONS: Array<[key: string, label: string]> = [
  ['pathological', 'Enfermedades de base'],
  ['autoimmune', 'Enfermedades autoinmunes'],
  ['coagulation', 'Trastornos de coagulación'],
  ['neuromuscular', 'Enfermedad neuromuscular'],
  ['herpes', 'Herpes labial recurrente'],
  ['surgical', 'Quirúrgicos'],
  ['traumatic', 'Traumáticos'],
  ['allergies', 'Alergias'],
  ['anticoagulants', 'Anticoagulantes / antiagregantes'],
  ['isotretinoin', 'Isotretinoína (últimos 6 meses)'],
  ['dermatological', 'Dermatológicos'],
  ['keloids', 'Cicatrices hipertróficas o queloides'],
  ['family', 'Familiares'],
  ['smoking', 'Tabaquismo'],
  ['alcohol', 'Consumo de alcohol'],
  ['sun', 'Exposición solar frecuente'],
  ['pregnancy', 'Embarazo'],
  ['lactation', 'Lactancia'],
];

const PROCEDURE_TYPES: Record<string, string> = {
  TOXINA: 'Toxina botulínica',
  ACIDO_HIALURONICO: 'Ácido hialurónico (relleno)',
  BIOESTIMULADOR: 'Bioestimulador de colágeno',
  MESOTERAPIA: 'Mesoterapia',
  PEELING: 'Peeling químico',
  MICRONEEDLING: 'Microneedling',
  LASER: 'Láser',
  ENERGIA: 'Tecnología basada en energía',
  HILOS: 'Hilos tensores',
  CIRUGIA: 'Cirugía estética',
  COMBINADO: 'Procedimiento combinado',
  OTRO: 'Otro',
};

const ZONES: Record<string, string> = {
  frente: 'Frente',
  glabela: 'Glabela',
  periorbitaria: 'Región periorbitaria',
  temporal: 'Región temporal',
  malar: 'Región malar',
  pomulos: 'Pómulos',
  nariz: 'Nariz',
  nasogeniano: 'Surcos nasogenianos',
  labios: 'Labios',
  menton: 'Mentón',
  mandibular: 'Línea mandibular',
  submentoniana: 'Región submentoniana',
  cuello: 'Cuello',
  corporal: 'Zona corporal',
};

const SYSTEMS: Array<[string, string]> = [
  ['general', 'General'],
  ['skin', 'Piel y faneras'],
  ['cardio', 'Cardiovascular'],
  ['resp', 'Respiratorio'],
  ['digestive', 'Digestivo'],
  ['endocrine', 'Endocrino'],
  ['hemato', 'Hematológico'],
  ['neuro', 'Neurológico'],
  ['musculo', 'Osteomuscular'],
  ['genito', 'Genitourinario'],
  ['mental', 'Salud mental y percepción corporal'],
];
const SYSTEM_STATUS: Record<string, string> = { POS: 'Positivo', NEG: 'Negativo', NE: 'No evaluado' };

const FITZPATRICK: Record<string, string> = {
  I: 'I · Siempre se quema, nunca se broncea',
  II: 'II · Se quema fácilmente, se broncea mínimamente',
  III: 'III · Se quema moderadamente, se broncea gradualmente',
  IV: 'IV · Se quema mínimamente, se broncea con facilidad',
  V: 'V · Rara vez se quema, se broncea intensamente',
  VI: 'VI · Nunca se quema, piel profundamente pigmentada',
};
const GLOGAU: Record<string, string> = {
  I: 'I · Sin arrugas',
  II: 'II · Arrugas en movimiento',
  III: 'III · Arrugas en reposo',
  IV: 'IV · Solo arrugas',
};
const SKIN_TYPES: Record<string, string> = {
  NORMAL: 'Normal',
  SECA: 'Seca',
  GRASA: 'Grasa',
  MIXTA: 'Mixta',
  SENSIBLE: 'Sensible',
};
const GRADES: Record<string, string> = { '0': 'Sin alteración', '1': 'Leve', '2': 'Moderada', '3': 'Severa' };
const SKIN_PARAMS: Array<[string, string]> = [
  ['hydration', 'Deshidratación'],
  ['elasticity', 'Pérdida de elasticidad'],
  ['texture', 'Alteración de textura'],
  ['pores', 'Poros dilatados'],
  ['pigmentation', 'Alteración de pigmentación'],
  ['laxity', 'Laxitud'],
  ['wrinkles', 'Arrugas'],
  ['tissue', 'Pérdida de calidad tisular'],
];
const EXAM_FIELDS: Array<[string, string]> = [
  ['generalState', 'Estado general'],
  ['dermatological', 'Evaluación dermatológica'],
  ['facial', 'Exploración facial'],
  ['symmetry', 'Simetría'],
  ['skinQuality', 'Calidad cutánea'],
  ['wrinkles', 'Arrugas dinámicas y estáticas'],
  ['flaccidity', 'Flacidez'],
  ['hyperpigmentation', 'Hiperpigmentación'],
  ['scars', 'Cicatrices'],
  ['lesions', 'Lesiones visibles'],
  ['volume', 'Alteraciones de volumen'],
];
const HABITS: Array<[string, string, Record<string, string>]> = [
  ['water', 'Consumo de agua', { MENOS_1L: 'Menos de 1 L/día', '1_2L': '1 a 2 L/día', MAS_2L: 'Más de 2 L/día' }],
  ['activity', 'Actividad física', { SEDENTARIO: 'Sedentario', MODERADO: 'Moderada', INTENSO: 'Intensa' }],
  ['sleep', 'Horas de sueño', { MENOS_6H: 'Menos de 6 h', '6_8H': '6 a 8 h', MAS_8H: 'Más de 8 h' }],
  ['sunscreen', 'Protección solar', { NUNCA: 'Nunca', OCASIONAL: 'Ocasional', DIARIO: 'Diaria' }],
  ['stress', 'Nivel de estrés', { BAJO: 'Bajo', MODERADO: 'Moderado', ALTO: 'Alto' }],
];
const CONTRAINDICATIONS: Record<string, string> = {
  NINGUNA: 'Sin contraindicaciones identificadas',
  RELATIVAS: 'Contraindicaciones relativas',
  ABSOLUTAS: 'Contraindicaciones absolutas',
};

const VIEWS: Record<string, string> = { FRONTAL: 'Frontal', DERECHO: 'Perfil derecho', IZQUIERDO: 'Perfil izquierdo', OBLICUA_DER: '45° derecho', OBLICUA_IZQ: '45° izquierdo' };
const MARK_KINDS: Record<string, string> = {
  TRATADA: 'Zona tratada',
  HALLAZGO: 'Hallazgo',
  PLAN: 'Zona planificada',
  EVENTO: 'Evento adverso',
};
const PHOTO_ANGLES: Record<string, string> = {
  FRONTAL: 'Frontal',
  OBLICUA_DER: '45° derecho',
  PERFIL_DER: 'Perfil derecho',
  OBLICUA_IZQ: '45° izquierdo',
  PERFIL_IZQ: 'Perfil izquierdo',
  DETALLE: 'Detalle',
};
const PHOTO_MOMENTS: Record<string, string> = { ANTES: 'Antes', DESPUES: 'Después', CONTROL: 'Control' };
const TOLERANCE: Record<string, string> = { BUENA: 'Buena', REGULAR: 'Regular', MALA: 'Mala' };
const CONSENTS: Record<string, string> = {
  AES_TOXINA: 'Toxina botulínica (CI-EST-01)',
  AES_RADIESSE: 'Radiesse® (CI-EST-02)',
  AES_ACIDO_HIALURONICO: 'Ácido hialurónico reticulado (CI-EST-04)',
  AES_SKINBOOSTER: 'Skinbooster (CI-EST-05)',
  AES_MESOTERAPIA: 'Mesoterapia Mesohyal™ X-DNA (CI-EST-07)',
  AES_PEELING_MELANOSTOP: 'Peeling Melanostop Tranex',
  AES_PEELING_EYECON: 'Peeling periocular Global Eyecon®',
  AES_EXILIS: 'Exilis Ultra 360®',
  AES_LASER: 'Láser',
  AES_MICRONEEDLING: 'Microneedling',
  AES_HILOS: 'Hilos tensores',
  AES_USO_IMAGEN: 'Uso de imagen con fines de divulgación',
};

export const procedureTypeLabel = (k: string) => PROCEDURE_TYPES[k] || k || '—';
export const zoneLabel = (k: string) => ZONES[k] || k;
export const photoAngleLabel = (k: string) => PHOTO_ANGLES[k] || k;
export const photoMomentLabel = (k: string) => PHOTO_MOMENTS[k] || k;

/** yyyy-mm-dd → dd/mm/aaaa sin desfase de zona horaria. */
export function isoDay(v: unknown) {
  const s = str(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

const lines = (...rows: Array<string | false | null | undefined>) => rows.filter((r): r is string => !!r && !!r.trim()).join('\n');
const labeled = (label: string, value: unknown) => {
  const v = str(value);
  return v ? `${label}: ${v}` : '';
};

export interface AesTextSection {
  kind: 'text';
  title: string;
  text: string;
  highlight?: boolean;
}
export interface AesTableSection {
  kind: 'table';
  title: string;
  widths: string[];
  header: string[];
  rows: string[][];
}
export type AesPdfSection = AesTextSection | AesTableSection;

const text = (title: string, value: string, highlight = false): AesTextSection => ({ kind: 'text', title, text: value, highlight });

function bmi(vitals: Obj) {
  const w = parseFloat(str(vitals['weightKg']).replace(',', '.'));
  const h = parseFloat(str(vitals['heightCm']).replace(',', '.')) / 100;
  return w && h ? (w / (h * h)).toFixed(1) : '';
}

/** Secciones de la atención (content.aesthetic + campos generales de la HC). */
export function aestheticRecordSections(content: Obj): AesPdfSection[] {
  const a = obj(content['aesthetic']);
  const care = obj(content['careMinimum']);
  const consult = obj(a['consult']);
  const out: AesPdfSection[] = [];

  out.push(
    text(
      'Motivo de consulta',
      lines(
        str(care['motive']),
        labeled('Inconformidades estéticas', consult['concerns']),
        arr(consult['zones']).length ? `Zonas de interés: ${arr(consult['zones']).map((z) => zoneLabel(str(z))).join(', ')}` : '',
        labeled('Objetivos del paciente', consult['goals']),
        labeled('Expectativas del tratamiento', consult['expectations']),
        arr(consult['requestedTreatments']).length
          ? `Tratamientos solicitados: ${arr(consult['requestedTreatments']).map((t) => procedureTypeLabel(str(t))).join(', ')}`
          : '',
      ),
    ),
    text(
      'Enfermedad o situación actual',
      lines(
        str(care['presentIllness']),
        labeled('Tiempo de evolución', consult['evolutionTime']),
        labeled('Síntomas asociados', consult['symptoms']),
        labeled('Resultados de intervenciones previas', consult['previousResults']),
      ),
    ),
  );

  // Antecedentes: lo respondido en tabla; lo no investigado se declara aparte (no es un "No").
  const history = obj(a['history']);
  const answered: string[][] = [];
  const pending: string[] = [];
  for (const [key, label] of CONDITIONS) {
    const row = obj(history[key]);
    const answer = str(row['answer']);
    if (answer) answered.push([label, ANSWER[answer] || answer, str(row['detail'])]);
    else pending.push(label);
  }
  if (answered.length) {
    out.push({ kind: 'table', title: 'Antecedentes personales', widths: ['34%', '14%', '*'], header: ['Antecedente', 'Respuesta', 'Detalle'], rows: answered });
    if (pending.length) out.push(text('Antecedentes no investigados', pending.join(', ')));
  } else if (str(care['antecedents'])) {
    out.push(text('Antecedentes', str(care['antecedents'])));
  }

  const prevAnswer = str(a['previousTreatmentsAnswer']);
  const previous = arr(a['previousTreatments']).map(obj);
  if (previous.length) {
    out.push({
      kind: 'table',
      title: 'Antecedentes estéticos',
      widths: ['20%', '12%', '16%', '18%', '*'],
      header: ['Tratamiento', 'Fecha', 'Zona', 'Producto', 'Complicaciones / notas'],
      rows: previous.map((t) => [
        procedureTypeLabel(str(t['type'])),
        isoDay(t['date']),
        str(t['zone']),
        str(t['product']),
        lines(str(t['complications']), str(t['notes'])),
      ]),
    });
  } else if (prevAnswer) {
    out.push(text('Antecedentes estéticos', `Tratamientos estéticos previos: ${ANSWER[prevAnswer] || prevAnswer}`));
  }

  const medsAnswer = str(a['medicationsAnswer']);
  const meds = arr(a['medications']).map(obj).filter((m) => str(m['name']));
  if (meds.length) {
    out.push({
      kind: 'table',
      title: 'Medicación actual',
      widths: ['26%', '14%', '12%', '16%', '*'],
      header: ['Medicamento', 'Concentración', 'Vía', 'Frecuencia', 'Observaciones'],
      rows: meds.map((m) => [str(m['name']), str(m['concentration']), str(m['route']), str(m['frequency']), str(m['notes'])]),
    });
  } else if (medsAnswer) {
    out.push(text('Medicación actual', `Medicación actual: ${ANSWER[medsAnswer] || medsAnswer}`));
  }

  const habits = obj(a['habits']);
  out.push(
    text(
      'Hábitos y estilo de vida',
      lines(
        ...HABITS.map(([key, label, opts]) => (habits[key] ? `${label}: ${opts[str(habits[key])] || str(habits[key])}` : '')),
        labeled('Otros hábitos', a['habitsNotes']),
      ),
    ),
  );

  const systems = obj(a['systems']);
  const sysRows = SYSTEMS.map(([key, label]) => {
    const row = obj(systems[key]);
    const status = str(row['status']);
    return status || str(row['detail']) ? [label, SYSTEM_STATUS[status] || '—', str(row['detail'])] : null;
  }).filter((r): r is string[] => !!r);
  if (sysRows.length) {
    out.push({ kind: 'table', title: 'Revisión por sistemas', widths: ['30%', '16%', '*'], header: ['Sistema', 'Hallazgo', 'Detalle'], rows: sysRows });
  } else if (str(care['systemsReview'])) {
    out.push(text('Revisión por sistemas', str(care['systemsReview'])));
  }

  const vitals = obj(a['vitals']);
  const exam = obj(a['exam']);
  const imc = bmi(vitals);
  out.push(
    text(
      'Examen físico',
      lines(
        [
          labeled('TA', vitals['bloodPressure']),
          labeled('FC', vitals['heartRate']),
          labeled('FR', vitals['respiratoryRate']),
          labeled('T °C', vitals['temperature']),
          labeled('SpO₂ %', vitals['spo2']),
          labeled('Peso kg', vitals['weightKg']),
          labeled('Talla cm', vitals['heightCm']),
          imc ? `IMC: ${imc}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        ...EXAM_FIELDS.map(([key, label]) => labeled(label, exam[key])),
      ),
    ),
  );

  const assess = obj(a['assessment']);
  const params = obj(assess['params']);
  out.push(
    text(
      'Valoración estética',
      lines(
        assess['fitzpatrick'] ? `Fototipo de Fitzpatrick: ${FITZPATRICK[str(assess['fitzpatrick'])] || str(assess['fitzpatrick'])}` : '',
        assess['skinType'] ? `Tipo de piel: ${SKIN_TYPES[str(assess['skinType'])] || str(assess['skinType'])}` : '',
        assess['glogau'] ? `Escala de Glogau: ${GLOGAU[str(assess['glogau'])] || str(assess['glogau'])}` : '',
        SKIN_PARAMS.filter(([k]) => str(params[k]))
          .map(([k, label]) => `${label}: ${GRADES[str(params[k])] || str(params[k])}`)
          .join(' · '),
        labeled('Proporciones faciales', assess['proportions']),
        labeled('Valoración por regiones', assess['regions']),
        labeled('Observaciones', assess['notes']),
      ),
    ),
  );

  const dx = obj(a['diagnosis']);
  out.push(
    text(
      'Análisis diagnóstico',
      lines(
        labeled('Hallazgos relevantes', dx['findings']),
        labeled('Diagnósticos diferenciales', dx['differentials']),
        dx['contraindications']
          ? `Contraindicaciones evaluadas: ${CONTRAINDICATIONS[str(dx['contraindications'])] || str(dx['contraindications'])}${str(dx['contraindicationsDetail']) ? ` — ${str(dx['contraindicationsDetail'])}` : ''}`
          : '',
        labeled('Justificación clínica', dx['justification']),
      ),
      true,
    ),
  );

  const plan = obj(a['plan']);
  out.push(
    text(
      'Plan de manejo',
      lines(
        labeled('Procedimiento considerado', plan['procedures']),
        labeled('Objetivos', plan['objectives']),
        labeled('Alternativas', plan['alternatives']),
        labeled('Riesgos individualizados', plan['risks']),
        labeled('Recomendaciones', plan['recommendations']),
        labeled('Seguimiento', plan['followUp']),
        plan['followUpDate'] ? `Próximo control: ${isoDay(plan['followUpDate'])}` : '',
      ),
    ),
  );

  return out.filter((s) => (s.kind === 'text' ? !!s.text.trim() : s.rows.length > 0));
}

/** Mapa facial, procedimientos y fotos del seguimiento longitudinal del paciente. */
export function aestheticTrackingSections(raw: unknown, attachmentLabels: Map<string, string> = new Map()): AesPdfSection[] {
  const data = obj(raw);
  const out: AesPdfSection[] = [];
  const procedures = arr(data['procedures']).map(obj).filter((p) => str(p['id']));
  const procLabel = new Map(procedures.map((p) => [str(p['id']), `${procedureTypeLabel(str(p['type']))} ${isoDay(p['date'])}`.trim()]));

  for (const p of [...procedures].sort((x, y) => str(x['date']).localeCompare(str(y['date'])))) {
    const product = obj(p['product']);
    const signed = str(p['status']) === 'FIRMADO';
    const addenda = arr(p['addenda']).map(obj).filter((a) => str(a['text']));
    const zones = arr(p['zones']).map((z) => zoneLabel(str(z)));
    const expired = !!str(product['expiry']) && !!str(p['date']) && str(product['expiry']) < str(p['date']);
    out.push(
      text(
        `Procedimiento: ${procedureTypeLabel(str(p['type']))} · ${isoDay(p['date'])}`,
        lines(
          signed
            ? `Estado: Firmado${str(p['signedBy']) ? ` por ${str(p['signedBy'])}` : ''}${str(p['signedAt']) ? ` el ${new Date(str(p['signedAt'])).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })}` : ''}`
            : 'Estado: Borrador (sin firmar)',
          zones.length || str(p['zoneDetail']) ? `Zona tratada: ${[zones.join(', '), str(p['zoneDetail'])].filter(Boolean).join(' — ')}` : '',
          [
            labeled('Producto', product['name']),
            labeled('Marca', product['brand']),
            labeled('Fabricante', product['manufacturer']),
            labeled('Presentación', product['presentation']),
          ]
            .filter(Boolean)
            .join(' · '),
          [
            labeled('Lote', product['lot']),
            product['expiry'] ? `Vencimiento: ${isoDay(product['expiry'])}${expired ? ' (vencido a la fecha del procedimiento)' : ''}` : '',
            labeled('Registro sanitario', product['invima']),
          ]
            .filter(Boolean)
            .join(' · '),
          str(p['quantity']) ? `Cantidad registrada por el profesional: ${str(p['quantity'])} ${str(p['unit'])}`.trim() : '',
          labeled('Preparación / dilución', p['preparation']),
          labeled('Anestesia', p['anesthesia']),
          labeled('Asepsia', p['asepsis']),
          labeled('Técnica utilizada', p['technique']),
          [labeled('Equipo', p['device']), labeled('Parámetros', p['parameters'])].filter(Boolean).join(' · '),
          p['tolerance'] ? `Tolerancia: ${TOLERANCE[str(p['tolerance'])] || str(p['tolerance'])}` : '',
          labeled('Incidencias', p['incidents']),
          labeled('Eventos adversos', p['adverseEvents']),
          labeled('Indicaciones posteriores', p['instructions']),
          p['nextControl'] ? `Fecha de control: ${isoDay(p['nextControl'])}` : '',
          p['consentRef'] ? `Consentimiento vinculado: ${CONSENTS[str(p['consentRef'])] || str(p['consentRef'])}` : '',
          labeled('Notas', p['notes']),
          ...addenda.map(
            (a) =>
              `Adenda${str(a['by']) ? ` de ${str(a['by'])}` : ''}${str(a['at']) ? ` (${new Date(str(a['at'])).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })})` : ''}: ${str(a['text'])}`,
          ),
        ),
      ),
    );
  }

  const annotations = arr(data['annotations']).map(obj).filter((a) => str(a['id']));
  if (annotations.length) {
    out.push({
      kind: 'table',
      title: 'Mapa facial: anotaciones',
      widths: ['11%', '13%', '17%', '13%', '*', '15%'],
      header: ['Fecha', 'Vista', 'Zona', 'Tipo', 'Observación', 'Procedimiento'],
      rows: [...annotations]
        .sort((x, y) => str(x['date']).localeCompare(str(y['date'])))
        .map((a) => [
          isoDay(a['date']),
          VIEWS[str(a['view'])] || str(a['view']),
          zoneLabel(str(a['zone'])),
          MARK_KINDS[str(a['kind'])] || str(a['kind']),
          `${str(a['note'])}${str(a['lockedAt']) ? (str(a['note']) ? ' · ' : '') + 'Cerrada' : ''}`,
          procLabel.get(str(a['procedureId'])) || '',
        ]),
    });
  }

  const photos = arr(data['photos']).map(obj).filter((p) => str(p['id']));
  if (photos.length) {
    out.push({
      kind: 'table',
      title: 'Fotografías clínicas registradas',
      widths: ['12%', '15%', '11%', '*', '20%'],
      header: ['Fecha', 'Vista', 'Momento', 'Archivo / nota', 'Procedimiento'],
      rows: [...photos]
        .sort((x, y) => str(x['date']).localeCompare(str(y['date'])))
        .map((p) => [
          isoDay(p['date']),
          photoAngleLabel(str(p['angle'])),
          photoMomentLabel(str(p['moment'])),
          [attachmentLabels.get(str(p['attachmentId'])) || '', str(p['note'])].filter(Boolean).join(' · '),
          procLabel.get(str(p['procedureId'])) || '',
        ]),
    });
  }
  return out;
}
