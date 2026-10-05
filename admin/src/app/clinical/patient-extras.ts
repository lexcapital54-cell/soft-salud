/** Datos de la ficha de ingreso de psicología sin columna propia (Patient.extras). */
export interface PatientExtras {
  birthPlace?: string;
  neighborhood?: string;
  stratum?: string;
  religion?: string;
  otherSpecialtyCare?: string[];
  otherSpecialtyDetail?: string;
  currentMedications?: string;
}

export const NO_OTHER_SPECIALTY = 'Ninguna';

export const OTHER_SPECIALTY_OPTIONS = [
  'Psiquiatría',
  'Neurología',
  'Neuropsicología',
  'Terapia ocupacional',
  'Fonoaudiología',
  'Pediatría',
  'Medicina general',
  'Otra',
];

export const STRATUM_OPTIONS = ['1', '2', '3', '4', '5', '6'];

/** Marca o desmarca una especialidad; «Ninguna» excluye a las demás. */
export function toggleOtherSpecialty(current: string[] | undefined, option: string): string[] {
  const list = current ?? [];
  if (list.includes(option)) return list.filter((o) => o !== option);
  if (option === NO_OTHER_SPECIALTY) return [NO_OTHER_SPECIALTY];
  return [...list.filter((o) => o !== NO_OTHER_SPECIALTY), option];
}

export function ageFromBirthDate(birthDate?: string | null): number | null {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
}
