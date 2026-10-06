import { ClinicSpecialty } from '@prisma/client';

/** Datos 100 % ficticios para los consultorios de demostración comercial. */

type Json = Record<string, unknown>;

export type DemoPatient = {
  documentType: string;
  documentNumber: string;
  firstName: string;
  lastName: string;
  secondLastName?: string;
  birthDate: string;
  sexAtBirth: string;
  address: string;
  city: string;
  department: string;
  municipalityCode: string;
  phone: string;
  email: string;
  eps: string;
  occupation?: string;
  guardianFullName?: string;
  guardianDocumentType?: string;
  guardianDocumentNumber?: string;
  guardianRelationship?: string;
  guardianPhone?: string;
  extras?: Json;
};

export type DemoRecord = {
  noteFormat: 'FULL';
  content: Json;
  diagnoses: { cieCode: string; description: string; type: 'PRINCIPAL' | 'RELATED' }[];
  procedures: { cupsCode: string; description: string }[];
  consents: { consentType: string; granted: boolean }[];
};

export type DemoSample = {
  patient: DemoPatient;
  reason: string;
  record?: DemoRecord;
  evolution?: { note: string; reason: string; currentSituation?: string };
};

export type DemoSpecialtyKit = {
  slug: string;
  label: string;
  professional: { fullName: string; card: string };
  patients: DemoSample[];
};

const CONSENTS = [
  { consentType: 'INFORMED', granted: true },
  { consentType: 'DATA_PROCESSING', granted: true },
];

const today = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() - 5 * 3600_000 + n * 86_400_000).toISOString().slice(0, 10);

let docSeq = 0;
function person(
  firstName: string,
  lastName: string,
  secondLastName: string,
  birthDate: string,
  sexAtBirth: 'F' | 'M',
  occupation: string,
  extra: Partial<DemoPatient> = {},
): DemoPatient {
  docSeq += 1;
  const n = String(docSeq).padStart(3, '0');
  return {
    documentType: 'CC',
    documentNumber: `99000${n}`,
    firstName,
    lastName,
    secondLastName,
    birthDate,
    sexAtBirth,
    address: `Calle ${10 + docSeq} # ${20 + docSeq}-0${docSeq % 9} (ficticia)`,
    city: 'Manizales',
    department: 'Caldas',
    municipalityCode: '17001',
    phone: `3000000${n}`,
    email: `paciente${n}@ejemplo.demo`,
    eps: 'EPS Demostración',
    occupation,
    ...extra,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Segunda historia del mismo tipo con otro motivo e impresión. */
function variant(record: DemoRecord, patch: { motive: string; impression?: string; illness?: string }): DemoRecord {
  const next = clone(record);
  const care = next.content.careMinimum as Json;
  care.motive = patch.motive;
  if (patch.illness) {
    if (next.content.dentistry) (next.content.dentistry as Json).currentIllness = patch.illness;
    else care.presentIllness = patch.illness;
  }
  if (patch.impression) {
    const assessment = (next.content.assessment ?? {}) as Json;
    assessment.impressionNarrative = patch.impression;
    next.content.assessment = assessment;
  }
  return next;
}

const EMPTY_MENTAL = {
  narrative: '', appearance: '', behavior: '', speech: '', mood: '', affect: '',
  thought: '', perception: '', judgment: '', insight: '',
};

// ─── Psicología ────────────────────────────────────────────────────────────

function psychologyRecord(): DemoRecord {
  return {
    noteFormat: 'FULL',
    consents: CONSENTS,
    content: {
      profile: 'FULL',
      careMinimum: {
        motive: 'Consulta por ansiedad persistente y dificultades para dormir desde hace 4 meses.',
        presentIllness:
          'Paciente de 29 años refiere preocupación excesiva por el trabajo, tensión muscular, insomnio de conciliación (2 h) e irritabilidad. Niega ataques de pánico. Los síntomas empeoran tras un cambio de cargo.',
        antecedents:
          'Personales: Gastritis crónica\nPsiquiátricos: No aplica\nFamiliares: Madre con trastorno depresivo\nTóxicos: Consumo social de alcohol',
        systemsReview:
          'Vive con su pareja, sin hijos. Profesional en contaduría. Red de apoyo adecuada. Rendimiento laboral afectado en el último trimestre.',
        antecedentFlags: {
          personales: { applies: true, detail: 'Gastritis crónica' },
          psiquiatricos: { applies: false, detail: '' },
          familiares: { applies: true, detail: 'Madre con trastorno depresivo' },
          toxicos: { applies: true, detail: 'Consumo social de alcohol' },
        },
      },
      mentalExam: {
        ...EMPTY_MENTAL,
        narrative:
          'Alerta, orientada en las tres esferas. Porte cuidado, colaboradora. Lenguaje fluido y coherente. Afecto ansioso, congruente. Pensamiento lógico con contenido de preocupación laboral; sin ideación suicida ni heteroagresiva. Sin alteraciones sensoperceptivas. Juicio conservado, introspección adecuada.',
      },
      assessment: {
        impressionNarrative:
          'Cuadro compatible con trastorno de ansiedad generalizada. Se inicia psicoterapia cognitivo-conductual.',
        observations: 'Riesgo suicida bajo.',
        managementPlan: [
          'Psicoeducación sobre ansiedad',
          'Técnicas de respiración diafragmática',
          'Registro de pensamientos automáticos',
          'Control semanal',
        ],
      },
      psychology: {
        therapeuticObjectives: 'Reducir síntomas ansiosos y mejorar la higiene del sueño.',
        approach: 'Cognitivo-conductual',
        modality: 'Individual presencial',
        frequency: 'Semanal',
        estimatedDuration: '3 meses',
        sessionCount: '12',
        treatmentPlan: [
          {
            id: 'pp1', cupsCode: '943102', description: 'Psicoterapia individual por psicología',
            sessions: '12', unitValue: '90000', discountPct: '', status: 'EN_TRATAMIENTO', notes: 'Enfoque TCC',
          },
        ],
      },
      vitals: { notes: '' },
      allergies: ['No refiere alergias'],
      medications: [],
      risks: { suicideRisk: '', notes: '' },
      rdaMeta: {
        includedEvents: ['anamnesis', 'mentalExam', 'evaluation', 'managementPlan'],
        deviceId: '',
        physicalLocation: 'Consultorio 201',
      },
    },
    diagnoses: [
      { cieCode: 'F41.1', description: 'Trastorno de ansiedad generalizada', type: 'PRINCIPAL' },
      { cieCode: 'F51.0', description: 'Insomnio no orgánico', type: 'RELATED' },
    ],
    procedures: [
      { cupsCode: '890208', description: 'Consulta de primera vez por psicología' },
      { cupsCode: '943102', description: 'Psicoterapia individual por psicología' },
    ],
  };
}

function psychologyKit(): DemoSpecialtyKit {
  const base = psychologyRecord();
  const second = variant(base, {
    motive: 'Tristeza, pérdida de interés y llanto fácil desde hace 2 meses tras ruptura de pareja.',
    illness:
      'Paciente de 34 años con ánimo bajo la mayor parte del día, anhedonia, hiporexia y despertar precoz. Niega ideación suicida estructurada.',
    impression: 'Episodio depresivo leve a moderado. Se inicia psicoterapia y seguimiento semanal.',
  });
  second.diagnoses = [
    { cieCode: 'F32.9', description: 'Episodio depresivo, no especificado', type: 'PRINCIPAL' },
  ];
  return {
    slug: 'psicologia',
    label: 'Psicología',
    professional: { fullName: 'Ps. Carolina Méndez (demo)', card: 'TP 000000-DEMO' },
    patients: [
      {
        patient: person('Valentina', 'Ríos', 'Arango', '1997-03-14', 'F', 'Contadora', {
          extras: { birthPlace: 'Manizales', neighborhood: 'La Francia', stratum: '3', religion: 'Católica', currentMedications: 'Ninguno' },
        }),
        reason: 'Consulta de primera vez',
        record: base,
        evolution: {
          reason: 'Nota de evolución',
          note:
            'Evolución terapéutica:\nSesión 2. Refiere disminución de la tensión muscular y mejor conciliación del sueño (40 min). Practica respiración diafragmática a diario.\n\nExamen mental:\nAlerta, orientada, afecto menos ansioso, pensamiento coherente, sin ideación de muerte.',
          currentSituation: 'Mejoría parcial de síntomas ansiosos.',
        },
      },
      {
        patient: person('Andrés', 'Salazar', 'Mejía', '1992-08-02', 'M', 'Ingeniero de sistemas'),
        reason: 'Consulta de primera vez',
        record: second,
      },
      { patient: person('María José', 'Cardona', 'López', '2001-11-25', 'F', 'Estudiante'), reason: 'Valoración inicial' },
      { patient: person('Felipe', 'Gómez', 'Henao', '1985-06-09', 'M', 'Comerciante'), reason: 'Valoración inicial' },
    ],
  };
}

// ─── Fisioterapia ──────────────────────────────────────────────────────────

function physioRecord(): DemoRecord {
  return {
    noteFormat: 'FULL',
    consents: CONSENTS,
    content: {
      profile: 'PHYSIOTHERAPY',
      careMinimum: {
        motive: 'Dolor lumbar con irradiación a miembro inferior izquierdo.',
        presentIllness:
          'Paciente de 45 años, conductor, con lumbalgia de 3 semanas tras levantar carga. Dolor punzante que aumenta en sedestación prolongada, irradiado a glúteo y cara posterior del muslo izquierdo.',
        antecedents: '',
        systemsReview: 'Sin hallazgos adicionales relevantes.',
      },
      assessment: { impressionNarrative: 'Lumbalgia mecánica con radiculopatía L5 izquierda.', observations: '', managementPlan: [] },
      physiotherapy: {
        antecedentsDetail: {
          personal: 'Sedentarismo', pathological: 'HTA controlada', surgical: '', allergic: '',
          pharmacological: 'Losartán 50 mg/día', family: 'Padre con artrosis', obgyn: '', traumatic: '',
          occupational: 'Conductor, 10 h/día sentado', others: '',
        },
        systemsReviewGrid: {
          cardiovascular: 'NORMAL', respiratory: 'NORMAL', neurological: 'ANORMAL',
          musculoskeletal: 'ANORMAL', skin: 'NORMAL', others: 'NORMAL',
        },
        physioDiagnosis: 'Deficiencia en la movilidad lumbar y el control motor del core asociada a lumbalgia mecánica.',
        findings: 'Contractura paravertebral lumbar bilateral, Lasègue (+) izquierdo a 50°, debilidad de glúteo medio izquierdo.',
        functionalAssessment: {
          pain: '7',
          jointMobility: 'Flexión lumbar 40° (limitada), extensión 15°, inclinación lateral D 20° / I 15°.',
          muscleStrength: '4/5',
          muscleStrengthDetail: 'Glúteo medio izquierdo 3+/5, abdominales 4/5.',
          muscleTone: 'Hipertonía paravertebral lumbar bilateral.',
          sensitivity: 'ALTERADO', coordination: 'NORMAL', balance: 'NORMAL', gait: 'ALTERADO',
          cardiorespiratory: 'NORMAL', otherFunctions: 'NA',
        },
        physioDxCode: 'M54.16',
        physioDxDescription: 'Radiculopatía, región lumbar',
        treatmentObjectives: 'Disminuir el dolor a EVA ≤3, recuperar la movilidad lumbar y fortalecer estabilizadores.',
        interventionPlan: 'Terapia manual, TENS, ejercicios de control motor y estiramientos de cadena posterior.',
        frequency: '3 veces por semana',
        estimatedDuration: '4 semanas',
        sessionCount: '12',
        treatmentPlan: [
          { id: 'ft1', cupsCode: '890211', description: 'Consulta primera vez por fisioterapia', sessions: '1', unitValue: '70000', discountPct: '', status: 'TERMINADO', notes: '' },
          { id: 'ft2', cupsCode: '931001', description: 'Terapia física integral', sessions: '12', unitValue: '55000', discountPct: '10', status: 'EN_TRATAMIENTO', notes: '' },
        ],
        closure: { closedAt: '', caseStatus: 'Activo', treatmentResult: '' },
        intake: {
          referralSource: 'CONVENIO_EPS', referralOther: '', assessmentDate: today(),
          antecedents: {
            pathological: { noRefers: false, diabetes: false, hypertension: true, surgeries: false },
            surgical: { noRefers: true, date: '' },
            traumatic: { noRefers: true, fractures: false, sprains: false },
            allergies: { noRefers: true, hasAllergies: false },
            noRefersOther: ['obgyn', 'others'],
          },
          zones: ['post:lumbar', 'post:gluteo_izq', 'post:muslo_izq'],
          zonesNotes: 'Irradiación por cara posterior del muslo izquierdo.',
          therapies: ['manualTherapy', 'electrotherapy', 'therapeuticExercise'],
          therapiesOther: '',
          posture: 'ALTERADA', postureNotes: 'Rectificación de lordosis lumbar',
          rangeOfMotion: 'LIMITADO', rangeNotes: 'Flexión lumbar 40°',
          strength: 'DISMINUIDA', strengthNotes: 'Glúteo medio izq 3+/5',
          painFrequency: 'DIARIO',
        },
      },
    },
    diagnoses: [
      { cieCode: 'M54.16', description: 'Radiculopatía, región lumbar', type: 'PRINCIPAL' },
      { cieCode: 'M54.50', description: 'Dolor lumbar, no especificado', type: 'RELATED' },
    ],
    procedures: [
      { cupsCode: '890211', description: 'Consulta de primera vez por fisioterapia' },
      { cupsCode: '931001', description: 'Terapia física integral' },
    ],
  };
}

function physioKit(): DemoSpecialtyKit {
  const base = physioRecord();
  const second = variant(base, {
    motive: 'Dolor y rigidez en hombro derecho al elevar el brazo.',
    illness: 'Paciente de 52 años, docente, con dolor de hombro derecho de 2 meses que limita peinarse y escribir en el tablero.',
    impression: 'Síndrome de manguito rotador derecho.',
  });
  const physio = second.content.physiotherapy as Json;
  physio.physioDiagnosis = 'Limitación de la movilidad glenohumeral derecha con dolor en arco medio.';
  physio.findings = 'Neer y Hawkins positivos a derecha, abducción activa 110°.';
  physio.physioDxCode = 'M75.1';
  physio.physioDxDescription = 'Síndrome del manguito rotatorio';
  (physio.intake as Json).zones = ['ant:hombro_der', 'post:hombro_der'];
  (physio.intake as Json).zonesNotes = 'Dolor en cara anterolateral del hombro derecho.';
  second.diagnoses = [{ cieCode: 'M75.1', description: 'Síndrome del manguito rotatorio', type: 'PRINCIPAL' }];
  return {
    slug: 'fisioterapia',
    label: 'Fisioterapia',
    professional: { fullName: 'Ft. Juliana Restrepo (demo)', card: 'TP 000001-DEMO' },
    patients: [
      {
        patient: person('Jorge', 'Ramírez', 'Ospina', '1981-02-11', 'M', 'Conductor'),
        reason: 'Valoración de fisioterapia',
        record: base,
        evolution: {
          reason: 'Nota de evolución',
          note:
            'Evolución terapéutica:\nSesión 3. Disminución del dolor a EVA 4/10, mejora de la flexión lumbar a 60°. Tolera ejercicios de control motor.\n\nEvaluación / hallazgos de la sesión:\nLasègue negativo, contractura paravertebral leve.',
          currentSituation: 'Mejoría progresiva, sin irradiación.',
        },
      },
      {
        patient: person('Claudia', 'Hoyos', 'Giraldo', '1974-09-30', 'F', 'Docente'),
        reason: 'Valoración de fisioterapia',
        record: second,
      },
      { patient: person('Santiago', 'Vélez', 'Duque', '1999-04-18', 'M', 'Futbolista aficionado'), reason: 'Esguince de tobillo' },
      { patient: person('Luz Marina', 'Castaño', 'Ruiz', '1960-12-03', 'F', 'Pensionada'), reason: 'Dolor de rodilla' },
    ],
  };
}

// ─── Odontología y ortodoncia ──────────────────────────────────────────────

function dentalBase(professional: string) {
  return {
    allergies: { none: true },
    allergyRows: [],
    medications: { none: true, rows: [], groups: {} },
    antecedents: {
      personal: '', family: 'Padre diabético', pathological: '', obgyn: '', allergic: '', pharmacological: '',
      surgical: '', smoking: 'No', smokingDetail: '', alcohol: 'Ocasional', alcoholDetail: '', oralHabits: '',
    },
    medicalConditions: {},
    medicalConditionAnswers: { hypertension: 'NO', diabetes: 'NO', cardiovascular: 'NO', coagulation: 'NO', pregnancy: 'NO' },
    medicalConditionDetails: {},
    systemsReview: {},
    systemsReviewNotes: 'Sin hallazgos sistémicos.',
    extraoral: {
      symmetry: 'Simétrica', profile: 'Recto', facialThirds: 'Proporcionados', lymphNodes: 'No palpables',
      tmj: 'Sin alteración', mouthOpening: '45', muscularPain: 'No', clicking: 'No', mandibularDeviation: 'No',
      lips: 'Normal', breathing: 'Nasal', skin: 'Normal', notes: '',
    },
    imaging: [],
    photos: {},
    closure: { closedAt: '', caseStatus: '', treatmentResult: '' },
    professional,
  };
}

function dentistryRecord(): DemoRecord {
  const doctor = 'Dra. Laura Gómez (demo)';
  const { professional: _p, ...base } = dentalBase(doctor);
  return {
    noteFormat: 'FULL',
    consents: CONSENTS,
    content: {
      profile: 'DENTISTRY',
      careMinimum: { motive: 'Dolor en muela superior derecha al masticar y sangrado de encías.', presentIllness: '', antecedents: '', systemsReview: '' },
      allergies: ['No refiere alergias'],
      medications: ['No consume medicamentos'],
      dentistry: {
        ...base,
        service: 'GENERAL',
        includeOrtho: false,
        currentIllness:
          'Dolor provocado al frío y a la masticación en la pieza 16 desde hace 3 semanas, sin dolor espontáneo. Sangrado gingival al cepillado.',
        dentalHistory: {
          lastVisit: 'Hace 1 año', visitFrequency: 'Anual', lastCleaning: 'Hace 1 año', lastXray: 'Hace 2 años',
          treatments: { extractions: true }, symptoms: { sensitivity: true, bleeding: true },
          anesthesiaReaction: 'NO', anesthesiaReactionDetail: '', notes: '',
        },
        habits: { bruxism: true },
        vitals: { bloodPressure: '118/76', heartRate: '72', respiratoryRate: '16', temperature: '36.5', spo2: '98' },
        intraoral: {
          hygiene: 'Regular', lips: 'Normal', mucosa: 'Normal', palate: 'Normal', tongue: 'Alterado',
          floorOfMouth: 'Normal', frenula: 'Normal', tonsils: 'Normal', otherLesions: '', glands: 'Flujo normal',
          dentition: 'Permanente', occlusion: 'Normal', occlusionNotes: '',
        },
        examNotes: { 'intraoral.tongue': 'Lengua saburral leve', 'intraoral.hygiene': 'Placa en sector posteroinferior' },
        periodontal: {
          gingiva: 'Inflamada', bleeding: 'Localizado', recessions: '', mobility: '',
          probingDepth: 'Bolsas de 4 mm en 16 y 46', plaque: 'Moderada', calculus: 'Supragingival',
          furcations: '', indices: "O'Leary 35%", notes: '',
        },
        periodontogram: {
          updatedAt: new Date().toISOString(),
          teeth: {
            '16': {
              pd: { b: [3, 4, 3], l: [3, 3, 3] }, rec: { b: [0, 0, 0], l: [0, 0, 0] },
              bop: { b: [false, true, false], l: [false, false, false] }, sup: { b: [false, false, false], l: [false, false, false] },
              plq: { b: [true, true, false], l: [false, false, false] }, mobility: 0, furcation: null,
            },
            '46': {
              pd: { b: [4, 4, 3], l: [3, 3, 3] }, rec: { b: [1, 0, 0], l: [0, 0, 0] },
              bop: { b: [true, true, false], l: [false, false, false] }, sup: { b: [false, false, false], l: [false, false, false] },
              plq: { b: [true, false, false], l: [true, false, false] }, mobility: 0, furcation: null,
            },
          },
        },
        odontogram: {
          '16': { surfaces: { O: 'CARIES', M: 'CARIES' } },
          '26': { surfaces: { O: 'RESTAURACION' } },
          '36': { conditions: ['ENDODONCIA', 'CORONA'] },
          '46': { surfaces: { O: 'CARIES' } },
          '48': { conditions: ['EXTRACCION_INDICADA'], note: 'Semiincluido' },
        },
        odontogramNotes: 'Dentición permanente completa salvo 18 y 28 ausentes.',
        diagnoses: [
          { cieCode: 'K021', rdaCode: '', description: 'Caries de la dentina', tooth: '16' },
          { cieCode: 'K051', rdaCode: '', description: 'Gingivitis crónica', tooth: '' },
        ],
        treatmentPlan: [
          { tooth: '', diagnosis: 'K051', code: '997301', description: 'Detartraje supragingival', professional: doctor, value: '90000', status: 'PENDIENTE', phase: 'HIGIENICA', quantity: '1', discount: '' },
          { tooth: '16', diagnosis: 'K021', code: '232102', description: 'Obturación dental con resina de fotocurado', professional: doctor, value: '120000', status: 'PENDIENTE', phase: 'CORRECTIVA', quantity: '1', discount: '' },
          { tooth: '48', diagnosis: '', code: '231201', description: 'Exodoncia quirúrgica multirradicular', professional: doctor, value: '250000', status: 'PENDIENTE', phase: 'CORRECTIVA', quantity: '1', discount: '10' },
        ],
        budget: {
          discountType: 'PCT', discountValue: '5', discountReason: 'Pago de contado', validUntil: inDays(30),
          paymentMethod: 'Por fases', installments: '', notes: '', acceptedAt: '', acceptedBy: '',
        },
        prescriptions: [
          { medication: 'Ibuprofeno 400 mg', dose: '1 tableta', route: 'Oral', frequency: 'Cada 8 horas', duration: '3 días', instructions: 'Después de las comidas' },
        ],
        orders: [{ type: 'RADIOGRAFIA', detail: 'Periapical de molares superiores derechos', code: '870455', notes: '' }],
        requiredConsents: ['CI-OD-001', 'HABEAS_DATA'],
      },
    },
    diagnoses: [
      { cieCode: 'K021', description: 'Caries de la dentina', type: 'PRINCIPAL' },
      { cieCode: 'K051', description: 'Gingivitis crónica', type: 'RELATED' },
    ],
    procedures: [{ cupsCode: '890203', description: 'Consulta de primera vez por odontología general' }],
  };
}

function dentistryKit(): DemoSpecialtyKit {
  const base = dentistryRecord();
  const second = variant(base, {
    motive: 'Control y limpieza; sensibilidad en dientes inferiores.',
    illness: 'Paciente de 38 años que consulta para profilaxis. Refiere sensibilidad al frío en incisivos inferiores.',
  });
  const dent = second.content.dentistry as Json;
  dent.odontogram = {
    '31': { surfaces: { V: 'DESGASTE' } },
    '41': { surfaces: { V: 'DESGASTE' } },
    '17': { surfaces: { O: 'SELLANTE' } },
    '27': { surfaces: { O: 'SELLANTE' } },
  };
  dent.diagnoses = [{ cieCode: 'K030', rdaCode: '', description: 'Atrición excesiva de los dientes', tooth: '31' }];
  dent.treatmentPlan = [
    { tooth: '', diagnosis: 'K030', code: '997001', description: 'Profilaxis y remoción de placa', professional: 'Dra. Laura Gómez (demo)', value: '80000', status: 'PENDIENTE', phase: 'HIGIENICA', quantity: '1', discount: '' },
  ];
  second.diagnoses = [{ cieCode: 'K030', description: 'Atrición excesiva de los dientes', type: 'PRINCIPAL' }];
  return {
    slug: 'odontologia',
    label: 'Odontología',
    professional: { fullName: 'Dra. Laura Gómez (demo)', card: 'TP 000002-DEMO' },
    patients: [
      { patient: person('Camila', 'Torres', 'Zuluaga', '1990-05-21', 'F', 'Abogada'), reason: 'Consulta de primera vez', record: base },
      { patient: person('Ricardo', 'Patiño', 'Marín', '1987-10-07', 'M', 'Administrador'), reason: 'Control y profilaxis', record: second },
      { patient: person('Daniela', 'Arias', 'Quintero', '2003-01-16', 'F', 'Estudiante'), reason: 'Valoración inicial' },
      { patient: person('Hernán', 'Londoño', 'Botero', '1968-07-28', 'M', 'Agricultor'), reason: 'Dolor dental' },
    ],
  };
}

function orthodonticsRecord(): DemoRecord {
  const doctor = 'Dr. Andrés Ríos (demo)';
  const { professional: _p, ...base } = dentalBase(doctor);
  return {
    noteFormat: 'FULL',
    consents: CONSENTS,
    content: {
      profile: 'DENTISTRY',
      careMinimum: { motive: 'Dientes apiñados y mordida profunda; desea mejorar la estética de la sonrisa.', presentIllness: '', antecedents: '', systemsReview: '' },
      allergies: ['No refiere alergias'],
      medications: ['No consume medicamentos'],
      dentistry: {
        ...base,
        service: 'ORTODONCIA',
        includeOrtho: false,
        currentIllness: 'Paciente de 16 años remitida por odontólogo general por apiñamiento anterosuperior y sobremordida.',
        dentalHistory: {
          anesthesiaReaction: 'NO', lastVisit: 'Hace 6 meses', visitFrequency: 'Semestral', lastCleaning: 'Hace 6 meses',
          lastXray: 'Hace 1 mes', treatments: {}, symptoms: {}, anesthesiaReactionDetail: '', notes: '',
        },
        habits: {},
        vitals: { bloodPressure: '110/70', heartRate: '78', respiratoryRate: '16', temperature: '36.4', spo2: '99' },
        intraoral: {
          hygiene: 'Buena', dentition: 'Permanente', occlusion: 'Maloclusión', occlusionNotes: 'Clase II división 2',
          lips: 'Normal', mucosa: 'Normal', palate: 'Normal', tongue: 'Normal', floorOfMouth: 'Normal',
          frenula: 'Normal', tonsils: 'Normal', otherLesions: '', glands: 'Flujo normal',
        },
        orthoArches: { upper: true, lower: true },
        orthodontics: {
          facial: {
            facialType: 'Braquifacial', profile: 'Convexo', symmetry: 'Simétrico', midline: 'Centrada',
            lowerThird: 'Disminuido', lipCompetence: 'Competente', smile: 'Consonante', dentalExposure: '2 mm en reposo',
            buccalCorridor: 'Normal', nasolabialAngle: '100°',
          },
          intraoral: {
            molarRight: 'Clase II', molarLeft: 'Clase II', canineRight: 'Clase II', canineLeft: 'Clase I',
            overjet: '3', overbite: '6', openBite: 'No', crossBite: 'No', deepBite: 'Sí', crowding: 'Moderado',
            diastemas: '', dentalMidline: 'Desviada 1 mm a la derecha', curveOfSpee: 'Profunda', crossBiteSide: '',
            upperMidline: '0', lowerMidline: '1', lowerCrownHeight: '9',
          },
          habits: {},
          cephalometry: {
            sna: '82', snb: '77', anb: '5', wits: '3', fma: '20', impa: '96', upperIncisor: '95',
            skeletalClass: 'Clase II', growthPattern: 'Horizontal',
          },
          models: { upperDiscrepancy: '-4', lowerDiscrepancy: '-2', bolton: 'Normal', archForm: 'Ovoide' },
          measurements: '',
          diagnosis: 'Maloclusión clase II división 2 esquelética con mordida profunda y apiñamiento moderado.',
          phase: 'Fase 1: alineación y nivelación',
          objectives: 'Alinear, nivelar la curva de Spee, corregir el overbite y la relación canina.',
          extractions: 'Sin extracciones',
          appliance: 'Brackets metálicos de autoligado 0.022',
          estimatedDuration: '24 meses',
          retention: 'Retenedor fijo 3-3 inferior y Essix superior',
          notes: '',
        },
        orthoCase: {
          status: 'PLANIFICADO', treatmentType: 'Brackets de autoligado', startDate: today(), orthodontist: doctor,
          motives: ['Dientes apiñados / torcidos', 'Estética de la sonrisa'], motiveAesthetic: 'Apiñamiento visible',
          motiveFunctional: '', concern: 'Dientes superiores torcidos', expectations: 'Sonrisa alineada', evolutionTime: '2 años',
          prior: { had: 'NO', ageStart: '', applianceType: '', duration: '', endReason: '', retainerUse: '', retainerType: '', relapse: '', surgery: '', extractions: '' },
        },
        orthoDx: {
          categories: { skeletal: 'Clase II', dental: 'Clase II', vertical: 'Mordida profunda', transverse: 'Normal', functional: 'Normal', softTissue: 'Alterado', crowding: 'Moderado' },
          problems: [{ id: 'pb1', problem: 'Mordida profunda', severity: 'Moderado', location: 'Anterior', priority: 'Alta', status: 'Activo' }],
          objectives: [{ id: 'ob1', problemId: 'pb1', objective: 'Corregir overbite', priority: 'Alta', status: 'Pendiente' }],
          plans: [{ id: 'pl1', label: 'Plan A sin extracciones', description: 'Autoligado con nivelación de Spee', advantages: 'Conserva piezas', considerations: 'Requiere elásticos clase II', extractions: '', appliance: 'Autoligado', duration: '24 meses', notes: '' }],
          selectedPlan: 'pl1', selectedAt: today(), selectedBy: doctor, extractions: [],
        },
        orthoMech: {
          appliances: [{ id: 'ap1', type: 'Brackets de autoligado', arch: 'Ambas', brand: 'Genérica', reference: '0.022', date: '', status: 'Planificado', notes: '' }],
          wires: [], elastics: [], ipr: [], tads: [],
          aligners: { brand: '', plan: '', total: '', start: '', hoursPerDay: '22', daysPerAligner: '14', compliance: '', states: {}, delivered: {} },
        },
        orthoBudget: {
          items: [{ id: 'bi1', concept: 'Tratamiento de ortodoncia', description: 'Autoligado 24 meses', qty: '1', unitValue: '4800000', discountPct: '5', status: 'Cotizado' }],
          downPayment: '1200000', installments: '24', startDate: inDays(25), quotedAt: today(), notes: '',
        },
        orthoCeph: { analysis: 'Steiner', rows: {}, notes: 'Clase II esquelética por retrusión mandibular.' },
        orthoFollow: { agenda: [], retainers: [], checks: [] },
        diagnoses: [
          { cieCode: 'K072', rdaCode: '', description: 'Anomalías de la relación entre los arcos dentarios', tooth: '' },
          { cieCode: 'K073', rdaCode: '', description: 'Anomalías de la posición del diente', tooth: '' },
        ],
        treatmentPlan: [
          { tooth: '', diagnosis: 'K072', code: '247101', description: 'Colocación de aparatología fija para ortodoncia (arcada)', professional: doctor, value: '1200000', status: 'PENDIENTE', phase: 'CORRECTIVA', quantity: '2', discount: '' },
        ],
        requiredConsents: ['CI-ORT-002', 'HABEAS_DATA'],
      },
    },
    diagnoses: [
      { cieCode: 'K072', description: 'Anomalías de la relación entre los arcos dentarios', type: 'PRINCIPAL' },
      { cieCode: 'K073', description: 'Anomalías de la posición del diente', type: 'RELATED' },
    ],
    procedures: [{ cupsCode: '890222', description: 'Consulta de primera vez por especialista en ortodoncia' }],
  };
}

function orthodonticsKit(): DemoSpecialtyKit {
  const base = orthodonticsRecord();
  const second = variant(base, {
    motive: 'Mordida abierta anterior y dificultad para cortar alimentos.',
    illness: 'Paciente adulta de 27 años con mordida abierta anterior desde la infancia; antecedente de deglución atípica.',
  });
  const dent = second.content.dentistry as Json;
  const ortho = dent.orthodontics as Json;
  (ortho.intraoral as Json).openBite = 'Sí';
  (ortho.intraoral as Json).deepBite = 'No';
  (ortho.intraoral as Json).overbite = '-2';
  ortho.diagnosis = 'Maloclusión clase I con mordida abierta anterior dentoalveolar.';
  (dent.orthoCase as Json).status = 'DIAGNOSTICO';
  const guardian = {
    documentType: 'TI',
    guardianFullName: 'Patricia Morales (madre)',
    guardianDocumentType: 'CC',
    guardianDocumentNumber: '99000900',
    guardianRelationship: 'Madre',
    guardianPhone: '3000000900',
  };
  return {
    slug: 'ortodoncia',
    label: 'Ortodoncia',
    professional: { fullName: 'Dr. Andrés Ríos (demo)', card: 'TP 000003-DEMO' },
    patients: [
      {
        patient: person('Sofía', 'Morales', 'Rendón', '2010-04-09', 'F', 'Estudiante', guardian),
        reason: 'Valoración de ortodoncia',
        record: base,
      },
      { patient: person('Natalia', 'Escobar', 'Franco', '1999-02-17', 'F', 'Diseñadora'), reason: 'Valoración de ortodoncia', record: second },
      { patient: person('Tomás', 'Aristizábal', 'Gil', '2012-09-01', 'M', 'Estudiante', { ...guardian, guardianFullName: 'Jorge Aristizábal (padre)', guardianRelationship: 'Padre' }), reason: 'Valoración inicial' },
      { patient: person('Isabela', 'Montoya', 'Serna', '2008-12-12', 'F', 'Estudiante', guardian), reason: 'Control de ortodoncia' },
    ],
  };
}

// ─── Medicina y medicina estética (formulario general) ─────────────────────

function generalRecord(input: {
  motive: string;
  illness: string;
  antecedents: Json;
  exam: string;
  impression: string;
  observations: string;
  plan: string[];
  diagnoses: DemoRecord['diagnoses'];
  procedures: DemoRecord['procedures'];
}): DemoRecord {
  const flags = input.antecedents as Record<string, { applies: boolean; detail: string }>;
  const line = (label: string, key: string) => `${label}: ${flags[key]?.applies ? flags[key].detail : 'No aplica'}`;
  return {
    noteFormat: 'FULL',
    consents: CONSENTS,
    content: {
      profile: 'FULL',
      careMinimum: {
        motive: input.motive,
        presentIllness: input.illness,
        antecedents: [
          line('Personales', 'personales'),
          line('Psiquiátricos', 'psiquiatricos'),
          line('Familiares', 'familiares'),
          line('Tóxicos', 'toxicos'),
        ].join('\n'),
        systemsReview: input.exam,
        antecedentFlags: input.antecedents,
      },
      mentalExam: { ...EMPTY_MENTAL },
      assessment: {
        impressionNarrative: input.impression,
        observations: input.observations,
        managementPlan: input.plan,
      },
      vitals: { notes: '' },
      allergies: [],
      medications: [],
      risks: { suicideRisk: '', notes: '' },
      rdaMeta: { includedEvents: ['anamnesis', 'evaluation', 'managementPlan'], deviceId: '', physicalLocation: '' },
    },
    diagnoses: input.diagnoses,
    procedures: input.procedures,
  };
}

function medicineKit(): DemoSpecialtyKit {
  const hta = generalRecord({
    motive: 'Control de hipertensión arterial y cefalea ocasional.',
    illness:
      'Paciente de 58 años con HTA diagnosticada hace 5 años, en manejo con losartán. Refiere cefalea occipital matutina 2 veces por semana. Niega dolor torácico, disnea o edemas.',
    antecedents: {
      personales: { applies: true, detail: 'HTA, dislipidemia' },
      psiquiatricos: { applies: false, detail: '' },
      familiares: { applies: true, detail: 'Padre con IAM a los 60 años' },
      toxicos: { applies: true, detail: 'Exfumador (10 paquetes/año)' },
    },
    exam:
      'Signos vitales: PA 148/92 mmHg, FC 78 lpm, FR 16 rpm, T 36.6 °C, SatO2 97 %, peso 82 kg, talla 1.70 m, IMC 28.4.\nExamen físico: ruidos cardiacos rítmicos sin soplos, murmullo vesicular conservado; abdomen blando no doloroso; extremidades sin edema; neurológico sin déficit.',
    impression: 'HTA esencial no controlada; sobrepeso. Se ajusta el antihipertensivo.',
    observations: 'Alergias: no refiere. Medicamentos: losartán 50 mg/día, atorvastatina 20 mg/noche.',
    plan: ['Losartán 100 mg/día', 'Dieta hiposódica y actividad física 150 min/semana', 'Perfil lipídico, creatinina y glicemia', 'Control en 1 mes'],
    diagnoses: [
      { cieCode: 'I10X', description: 'Hipertensión esencial (primaria)', type: 'PRINCIPAL' },
      { cieCode: 'E66.9', description: 'Obesidad, no especificada', type: 'RELATED' },
    ],
    procedures: [{ cupsCode: '890201', description: 'Consulta de primera vez por medicina general' }],
  });
  const dm = generalRecord({
    motive: 'Poliuria, polidipsia y cansancio desde hace 2 meses.',
    illness: 'Paciente de 49 años con aumento de la sed y de la micción, pérdida de 4 kg sin dieta. Glicemia capilar en farmacia de 245 mg/dL.',
    antecedents: {
      personales: { applies: true, detail: 'Sobrepeso' },
      psiquiatricos: { applies: false, detail: '' },
      familiares: { applies: true, detail: 'Madre con diabetes tipo 2' },
      toxicos: { applies: false, detail: '' },
    },
    exam: 'Signos vitales: PA 126/80 mmHg, FC 82 lpm, peso 88 kg, talla 1.68 m, IMC 31.2.\nExamen físico: acantosis nigricans en cuello; resto sin hallazgos.',
    impression: 'Probable diabetes mellitus tipo 2 de reciente diagnóstico.',
    observations: 'Alergias: no refiere. Sin medicamentos actuales.',
    plan: ['Hemoglobina glicosilada y glicemia en ayunas', 'Metformina 850 mg con el almuerzo', 'Educación en alimentación saludable', 'Control con resultados'],
    diagnoses: [{ cieCode: 'E11.9', description: 'Diabetes mellitus tipo 2 sin complicaciones', type: 'PRINCIPAL' }],
    procedures: [{ cupsCode: '890201', description: 'Consulta de primera vez por medicina general' }],
  });
  return {
    slug: 'medicina',
    label: 'Medicina general',
    professional: { fullName: 'Dr. Mauricio Peña (demo)', card: 'RM 000004-DEMO' },
    patients: [
      {
        patient: person('Gustavo', 'Bedoya', 'Cifuentes', '1968-01-22', 'M', 'Comerciante'),
        reason: 'Control de hipertensión',
        record: hta,
        evolution: {
          reason: 'Nota de evolución',
          note:
            'Evolución terapéutica:\nControl al mes. PA 132/84 mmHg con losartán 100 mg. Cefalea resuelta. Trae perfil lipídico con LDL 128 mg/dL.\n\nExamen mental:\nAlerta, orientado, sin alteraciones.',
          currentSituation: 'HTA en mejor control.',
        },
      },
      { patient: person('Beatriz', 'Ocampo', 'Valencia', '1977-05-05', 'F', 'Secretaria'), reason: 'Consulta de primera vez', record: dm },
      { patient: person('Alejandro', 'Muñoz', 'Pineda', '1995-08-14', 'M', 'Mensajero'), reason: 'Consulta general' },
      { patient: person('Gloria', 'Franco', 'Echeverri', '1955-03-27', 'F', 'Ama de casa'), reason: 'Control' },
    ],
  };
}

function aestheticKit(): DemoSpecialtyKit {
  const melasma = generalRecord({
    motive: 'Manchas en mejillas que empeoran con el sol.',
    illness: 'Paciente de 36 años con manchas marrones simétricas en mejillas y frente desde su último embarazo, hace 3 años.',
    antecedents: {
      personales: { applies: true, detail: 'Uso de anticonceptivos orales' },
      psiquiatricos: { applies: false, detail: '' },
      familiares: { applies: true, detail: 'Madre con melasma' },
      toxicos: { applies: false, detail: '' },
    },
    exam: 'Fototipo III. Máculas hiperpigmentadas de bordes irregulares en región malar bilateral y frente (melasma centrofacial). MASI 12. Sin lesiones inflamatorias.',
    impression: 'Melasma centrofacial epidérmico.',
    observations: 'Alergias: no refiere. Se explican cuidados posprocedimiento y fotoprotección estricta.',
    plan: ['Peeling químico con ácido glicólico 30 % (sesión 1 de 4)', 'Protector solar FPS 50 cada 3 horas', 'Despigmentante nocturno', 'Control en 3 semanas'],
    diagnoses: [{ cieCode: 'L81.1', description: 'Cloasma', type: 'PRINCIPAL' }],
    procedures: [{ cupsCode: '890202', description: 'Consulta de primera vez por medicina especializada' }],
  });
  const acne = generalRecord({
    motive: 'Brotes de acné en mentón y mandíbula.',
    illness: 'Paciente de 24 años con pápulas y pústulas recurrentes en tercio inferior del rostro, peor en periodo premenstrual.',
    antecedents: {
      personales: { applies: false, detail: '' },
      psiquiatricos: { applies: false, detail: '' },
      familiares: { applies: false, detail: '' },
      toxicos: { applies: false, detail: '' },
    },
    exam: 'Fototipo II. Pápulas y pústulas en mentón y ángulo mandibular, comedones cerrados; cicatrices atróficas leves.',
    impression: 'Acné vulgar inflamatorio moderado.',
    observations: 'Alergias: no refiere.',
    plan: ['Limpieza facial profunda', 'Peróxido de benzoilo 2.5 % gel nocturno', 'Protector solar oil free', 'Control en 4 semanas'],
    diagnoses: [{ cieCode: 'L70.0', description: 'Acné vulgar', type: 'PRINCIPAL' }],
    procedures: [{ cupsCode: '890202', description: 'Consulta de primera vez por medicina especializada' }],
  });
  return {
    slug: 'estetica',
    label: 'Medicina estética',
    professional: { fullName: 'Dra. Paula Jaramillo (demo)', card: 'RM 000005-DEMO' },
    patients: [
      { patient: person('Mariana', 'Uribe', 'Correa', '1990-07-19', 'F', 'Publicista'), reason: 'Valoración estética', record: melasma },
      { patient: person('Laura', 'Gaviria', 'Toro', '2002-02-08', 'F', 'Estudiante'), reason: 'Valoración estética', record: acne },
      { patient: person('Esteban', 'Rojas', 'Lozano', '1983-11-30', 'M', 'Arquitecto'), reason: 'Valoración inicial' },
      { patient: person('Catalina', 'Mesa', 'Ramírez', '1979-04-04', 'F', 'Empresaria'), reason: 'Rejuvenecimiento facial' },
    ],
  };
}

const KITS: Record<ClinicSpecialty, () => DemoSpecialtyKit> = {
  PSYCHOLOGY: psychologyKit,
  PHYSIOTHERAPY: physioKit,
  DENTISTRY: dentistryKit,
  ORTHODONTICS: orthodonticsKit,
  MEDICINE: medicineKit,
  AESTHETIC: aestheticKit,
};

/** Kit fresco por llamada (fechas del día y documentos únicos por demo). */
export function demoKit(specialty: ClinicSpecialty, seq: number): DemoSpecialtyKit {
  docSeq = seq * 10;
  return KITS[specialty]();
}
