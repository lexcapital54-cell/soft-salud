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
    name: 'Historia Clínica – Odontología (plantilla base)',
    schemaJson: { ...HCE_PSI_SCHEMA, specialty: 'DENTISTRY', stub: true },
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
};

export function templateDefinitionForSpecialty(specialty: ClinicSpecialty) {
  return TEMPLATE_BY_SPECIALTY[specialty];
}
