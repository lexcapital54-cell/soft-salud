import { ClinicSpecialty } from '@prisma/client';

export const HCE_PSI_SCHEMA = {
  version: 1,
  specialty: 'PSYCHOLOGY',
  sections: [
    'patientIdentification',
    'careData',
    'careMinimum',
    'diagnoses',
    'procedures',
    'medications',
    'allergies',
    'vitals',
    'risks',
    'rda',
    'consents',
    'audit',
    'attachments',
  ],
  contentDefaults: {
    profile: 'FULL',
    careMinimum: {
      motive: '',
      presentIllness: '',
      antecedents: '',
      systemsReview: '',
    },
    mentalExam: {
      appearance: '',
      behavior: '',
      speech: '',
      mood: '',
      affect: '',
      thought: '',
      perception: '',
      judgment: '',
      insight: '',
    },
    assessment: {
      impressionNarrative: '',
      observations: '',
      managementPlan: [],
    },
    vitals: { notes: '' },
    allergies: [],
    medications: [],
    risks: { suicideRisk: '', notes: '' },
    rdaMeta: {
      includedEvents: [],
      deviceId: '',
      physicalLocation: '',
    },
    signature: {
      professionalName: '',
      professionalCard: '',
      signedAt: null,
      verificationCode: '',
    },
  },
};

/** Historia Clínica Fisioterapia (HC-FT-001). */
export const HCE_FT_SCHEMA = {
  version: 1,
  specialty: 'PHYSIOTHERAPY',
  code: 'HC-FT-001',
  sections: [
    'patientIdentification',
    'careData',
    'antecedents',
    'presentIllness',
    'systemsReview',
    'physioEvaluation',
    'diagnoses',
    'therapeuticPlan',
    'evolutions',
    'closure',
    'consents',
    'professional',
    'attachments',
  ],
  contentDefaults: {
    profile: 'PHYSIOTHERAPY',
    careMinimum: {
      motive: '',
      presentIllness: '',
      antecedents: '',
      systemsReview: '',
    },
    mentalExam: {
      appearance: '',
      behavior: '',
      speech: '',
      mood: '',
      affect: '',
      thought: '',
      perception: '',
      judgment: '',
      insight: '',
      narrative: '',
    },
    assessment: {
      impressionNarrative: '',
      observations: '',
      managementPlan: [''],
    },
    vitals: { notes: '' },
    allergies: [],
    medications: [],
    risks: { suicideRisk: '', notes: '' },
    physiotherapy: {
      antecedentsDetail: {
        personal: '',
        pathological: '',
        surgical: '',
        allergic: '',
        pharmacological: '',
        family: '',
        obgyn: '',
        traumatic: '',
        occupational: '',
        others: '',
      },
      systemsReviewGrid: {
        cardiovascular: '',
        respiratory: '',
        neurological: '',
        musculoskeletal: '',
        skin: '',
        others: '',
      },
      physioDiagnosis: '',
      findings: '',
      functionalAssessment: {
        pain: '',
        jointMobility: '',
        muscleStrength: '',
        muscleStrengthDetail: '',
        muscleTone: '',
        sensitivity: '',
        coordination: '',
        balance: '',
        gait: '',
        cardiorespiratory: '',
        otherFunctions: '',
      },
      physioDxCode: '',
      physioDxDescription: '',
      treatmentObjectives: '',
      interventionPlan: '',
      frequency: '',
      estimatedDuration: '',
      sessionCount: '',
      closure: {
        closedAt: '',
        caseStatus: '',
        treatmentResult: '',
      },
    },
    rdaMeta: {
      includedEvents: [],
      deviceId: '',
      physicalLocation: '',
    },
    signature: {
      professionalName: '',
      professionalCard: '',
      signedAt: null,
      verificationCode: '',
    },
  },
};

/** Bloque odontológico por defecto (vive en ClinicalRecord.content.dentistry). */
export const DENTISTRY_CONTENT_DEFAULTS = {
  service: '',
  includeOrtho: false,
  currentIllness: '',
  antecedents: {
    personal: '',
    family: '',
    pathological: '',
    obgyn: '',
    allergic: '',
    pharmacological: '',
    surgical: '',
    smoking: '',
    smokingDetail: '',
    alcohol: '',
    alcoholDetail: '',
    oralHabits: '',
  },
  medicalConditions: {},
  allergies: {},
  medications: { none: false, rows: [], groups: {} },
  dentalHistory: {
    lastVisit: '',
    visitFrequency: '',
    lastCleaning: '',
    lastXray: '',
    treatments: {},
    symptoms: {},
    anesthesiaReaction: '',
    anesthesiaReactionDetail: '',
    notes: '',
  },
  habits: {},
  systemsReview: {},
  systemsReviewNotes: '',
  vitals: { bloodPressure: '', heartRate: '', respiratoryRate: '', temperature: '', spo2: '' },
  extraoral: {
    symmetry: '',
    profile: '',
    facialThirds: '',
    lymphNodes: '',
    tmj: '',
    mouthOpening: '',
    muscularPain: '',
    clicking: '',
    mandibularDeviation: '',
    lips: '',
    breathing: '',
    skin: '',
    notes: '',
  },
  intraoral: {
    hygiene: '',
    lips: '',
    mucosa: '',
    palate: '',
    tongue: '',
    floorOfMouth: '',
    frenula: '',
    tonsils: '',
    otherLesions: '',
    glands: '',
    dentition: '',
    occlusion: '',
    occlusionNotes: '',
  },
  periodontal: {
    gingiva: '',
    bleeding: '',
    recessions: '',
    mobility: '',
    probingDepth: '',
    plaque: '',
    calculus: '',
    furcations: '',
    indices: '',
    notes: '',
  },
  odontogram: {},
  orthoArches: { upper: false, lower: false },
  odontogramNotes: '',
  orthodontics: {
    facial: {
      facialType: '',
      profile: '',
      symmetry: '',
      midline: '',
      lowerThird: '',
      lipCompetence: '',
      smile: '',
      dentalExposure: '',
      buccalCorridor: '',
    },
    intraoral: {
      molarRight: '',
      molarLeft: '',
      canineRight: '',
      canineLeft: '',
      overjet: '',
      overbite: '',
      openBite: '',
      crossBite: '',
      deepBite: '',
      crowding: '',
      diastemas: '',
      dentalMidline: '',
      curveOfSpee: '',
    },
    habits: {},
    measurements: '',
    diagnosis: '',
    appliance: '',
    estimatedDuration: '',
    notes: '',
  },
  photos: {},
  imaging: [],
  diagnoses: [],
  treatmentPlan: [],
  prescriptions: [],
  orders: [],
  requiredConsents: [],
  closure: { closedAt: '', caseStatus: '', treatmentResult: '' },
};

/** Historia Clínica Odontología / Ortodoncia (HC-ODO-001). */
export const HCE_ODO_SCHEMA = {
  version: 2,
  specialty: 'DENTISTRY',
  code: 'HC-ODO-001',
  sections: [
    'patientIdentification',
    'reasonForVisit',
    'antecedents',
    'clinicalExam',
    'odontogram',
    'orthodontics',
    'photosAndImaging',
    'diagnoses',
    'treatmentPlan',
    'evolutions',
    'consents',
    'prescriptionsAndOrders',
    'attachments',
    'closure',
  ],
  contentDefaults: {
    ...HCE_PSI_SCHEMA.contentDefaults,
    profile: 'DENTISTRY',
    dentistry: DENTISTRY_CONTENT_DEFAULTS,
  },
};

/** Nota de evolución SOAP (FOLLOW_UP) — vive en ClinicalRecord.content JSONB */
export const SOAP_CONTENT_DEFAULTS = {
  profile: 'SOAP',
  soap: {
    subjective: '',
    objective: '',
    assessment: '',
    plan: '',
  },
  signature: {
    professionalName: '',
    professionalCard: '',
    signedAt: null,
    verificationCode: '',
  },
};

const TEMPLATE_BY_SPECIALTY: Record<
  ClinicSpecialty,
  { code: string; name: string; schemaJson: object }
> = {
  PSYCHOLOGY: {
    code: 'HCE_PSI',
    name: 'Historia Clínica Electrónica – Psicología',
    schemaJson: HCE_PSI_SCHEMA,
  },
  DENTISTRY: {
    code: 'HCE_ODO',
    name: 'Historia Clínica – Odontología / Ortodoncia (HC-ODO-001)',
    schemaJson: HCE_ODO_SCHEMA,
  },
  MEDICINE: {
    code: 'HCE_MED',
    name: 'Historia Clínica – Medicina (plantilla base)',
    schemaJson: { ...HCE_PSI_SCHEMA, specialty: 'MEDICINE', stub: true },
  },
  AESTHETIC: {
    code: 'HCE_AES',
    name: 'Historia Clínica – Medicina estética (plantilla base)',
    schemaJson: { ...HCE_PSI_SCHEMA, specialty: 'AESTHETIC', stub: true },
  },
  PHYSIOTHERAPY: {
    code: 'HCE_FT',
    name: 'Historia Clínica – Fisioterapia (HC-FT-001)',
    schemaJson: HCE_FT_SCHEMA,
  },
};

export function templateDefinitionForSpecialty(specialty: ClinicSpecialty) {
  return TEMPLATE_BY_SPECIALTY[specialty];
}

/** Defaults de contenido clínico según especialidad del consultorio. */
export function contentDefaultsForSpecialty(specialty: ClinicSpecialty) {
  if (specialty === ClinicSpecialty.PHYSIOTHERAPY) {
    return HCE_FT_SCHEMA.contentDefaults;
  }
  if (specialty === ClinicSpecialty.DENTISTRY) {
    return HCE_ODO_SCHEMA.contentDefaults;
  }
  return HCE_PSI_SCHEMA.contentDefaults;
}

export function externalCodePrefixForSpecialty(specialty: ClinicSpecialty) {
  switch (specialty) {
    case ClinicSpecialty.PSYCHOLOGY:
      return 'HC-PSI';
    case ClinicSpecialty.DENTISTRY:
      return 'HC-ODO';
    case ClinicSpecialty.MEDICINE:
      return 'HC-MED';
    case ClinicSpecialty.AESTHETIC:
      return 'HC-AES';
    case ClinicSpecialty.PHYSIOTHERAPY:
      return 'HC-FT';
    default:
      return 'HC-GEN';
  }
}
