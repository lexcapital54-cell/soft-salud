/**
 * El registro rápido desde la agenda abre la ficha solo con nombre y contacto.
 * Estos son los datos que la Res. 1995 y los RIPS exigen antes de poder firmar
 * la historia clínica, así que se validan en un único sitio.
 */
const REQUIRED_PROFILE_FIELDS = [
  ['documentType', 'Tipo de documento'],
  ['documentNumber', 'Número de documento'],
  ['birthDate', 'Fecha de nacimiento'],
] as const;

export interface ProfileCheckable {
  documentType: string | null;
  documentNumber: string | null;
  birthDate: Date | null;
}

export function missingProfileFields(patient: ProfileCheckable) {
  return REQUIRED_PROFILE_FIELDS.filter(([key]) => !patient[key]).map(
    ([, label]) => label,
  );
}

/** Añade a la ficha el estado de completitud que consume el frontend. */
export function withProfileStatus<T extends ProfileCheckable>(patient: T) {
  const missing = missingProfileFields(patient);
  return { ...patient, profileComplete: missing.length === 0, missingProfileFields: missing };
}
