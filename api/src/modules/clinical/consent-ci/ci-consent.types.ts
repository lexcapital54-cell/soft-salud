/**
 * Consentimientos informados estructurados (CI-OD-001, CI-ORT-002, CI-CIR-003).
 * La especificación viaja en `consent_templates.body_json` para que la HC
 * pinte los checks y el servidor valide con la misma fuente.
 */
export const CI_CONSENT_CODES = ['CI-OD-001', 'CI-ORT-002', 'CI-CIR-003'] as const;
export type CiConsentCode = (typeof CI_CONSENT_CODES)[number];

export const PATIENT_CONSENT_STATUSES = [
  'ACEPTADO',
  'REVOCADO',
  'PENDIENTE_FIRMA',
] as const;
export type PatientConsentStatus = (typeof PATIENT_CONSENT_STATUSES)[number];

export interface CiChoice {
  value: string;
  label: string;
}

export interface CiOptionGroup {
  key: string;
  label: string;
  multiple: boolean;
  required: boolean;
  hint?: string;
  choices: CiChoice[];
}

export interface CiCheckItem {
  key: string;
  label: string;
  detail: string;
}

export interface CiConsentSpec {
  kind: 'CI';
  code: CiConsentCode;
  /** Especialidad del profesional que se imprime en el documento. */
  professionalRole: string;
  teeth: 'required' | 'optional';
  teethLabel: string;
  options: CiOptionGroup[];
  /** Riesgos específicos: todos deben quedar explicados y aceptados. */
  risks: CiCheckItem[];
  /** Declaraciones del paciente: todas obligatorias. */
  declarations: CiCheckItem[];
}

export interface CiConsentDetails {
  code: CiConsentCode;
  teeth: number[];
  options: Record<string, string[]>;
  risksAccepted: string[];
  declarationsAccepted: string[];
  notes: string;
  filledAt: string;
}

export function isCiConsentSpec(value: unknown): value is CiConsentSpec {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'CI' &&
    CI_CONSENT_CODES.includes((value as { code?: unknown }).code as CiConsentCode)
  );
}
