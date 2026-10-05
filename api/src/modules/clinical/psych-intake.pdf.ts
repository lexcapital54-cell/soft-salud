import type { Content } from 'pdfmake/interfaces';

type PatientLike = {
  documentType?: string | null;
  documentNumber?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  secondLastName?: string | null;
  birthDate?: Date | string | null;
  sexAtBirth?: string | null;
  maritalStatus?: string | null;
  profession?: string | null;
  occupation?: string | null;
  address?: string | null;
  city?: string | null;
  department?: string | null;
  phone?: string | null;
  email?: string | null;
  eps?: string | null;
  regime?: string | null;
  guardianFullName?: string | null;
  guardianRelationship?: string | null;
  guardianPhone?: string | null;
  extras?: unknown;
};

type Extras = {
  birthPlace?: string;
  neighborhood?: string;
  stratum?: string;
  religion?: string;
  otherSpecialtyCare?: string[];
  otherSpecialtyDetail?: string;
  currentMedications?: string;
};

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Fecha de nacimiento guardada como día calendario (medianoche UTC). */
function birthParts(value: Date | string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), day: d.getUTCDate() };
}

export function psychBirthLabel(value: Date | string | null | undefined): string {
  const b = birthParts(value);
  if (!b) return '';
  return `${String(b.day).padStart(2, '0')}/${String(b.m + 1).padStart(2, '0')}/${b.y}`;
}

export function psychAgeLabel(value: Date | string | null | undefined, today = new Date()): string {
  const b = birthParts(value);
  if (!b) return '';
  let age = today.getFullYear() - b.y;
  const dm = today.getMonth() - b.m;
  if (dm < 0 || (dm === 0 && today.getDate() < b.day)) age -= 1;
  return age >= 0 ? `${age} años` : '';
}

/** Filas [etiqueta, valor] de identificación e información de salud (ficha de ingreso). */
export function psychPatientRows(patient: PatientLike) {
  const extras = (patient.extras && typeof patient.extras === 'object' ? patient.extras : {}) as Extras;
  const care = Array.isArray(extras.otherSpecialtyCare) ? extras.otherSpecialtyCare : [];
  const careText = care.length
    ? care.includes('Ninguna')
      ? 'No cuenta con otra especialidad'
      : [care.join(', '), text(extras.otherSpecialtyDetail)].filter(Boolean).join(' — ')
    : '';
  const residence = [text(patient.city), text(patient.department)].filter(Boolean).join(', ');

  const identification: [string, string][] = [
    ['Nombres y apellidos', [patient.firstName, patient.middleName, patient.lastName, patient.secondLastName].map(text).filter(Boolean).join(' ')],
    ['Documento', [text(patient.documentType), text(patient.documentNumber)].filter(Boolean).join(' ')],
    ['Lugar de nacimiento', text(extras.birthPlace)],
    ['Fecha de nacimiento', psychBirthLabel(patient.birthDate)],
    ['Edad', psychAgeLabel(patient.birthDate)],
    ['Sexo al nacer', text(patient.sexAtBirth)],
    ['Profesión', text(patient.profession) || text(patient.occupation)],
    ['Estado civil', text(patient.maritalStatus)],
    ['Religión', text(extras.religion)],
    ['Municipio de residencia', residence],
    ['Barrio', text(extras.neighborhood)],
    ['Estrato', text(extras.stratum)],
    ['Dirección', text(patient.address)],
    ['Celular', text(patient.phone)],
    ['Correo electrónico', text(patient.email)],
  ];
  if (text(patient.guardianFullName)) {
    identification.push([
      'Acudiente',
      [text(patient.guardianFullName), text(patient.guardianRelationship), text(patient.guardianPhone)].filter(Boolean).join(' · '),
    ]);
  }

  const health: [string, string][] = [
    ['EPS', text(patient.eps)],
    ['Régimen / vinculación', text(patient.regime)],
    ['Otra especialidad', careText],
    ['Medicamentos actuales', text(extras.currentMedications)],
  ];

  return { identification, health };
}

/** Tabla de 4 columnas (etiqueta, valor, etiqueta, valor); los vacíos se omiten. */
export function psychInfoTable(rows: [string, string][], labelColor: string): Content | null {
  const filled = rows.filter(([, v]) => v);
  if (!filled.length) return null;
  const cell = (label: string, value: string) => [
    { text: label, bold: true, color: labelColor, fontSize: 8.5, alignment: 'left' as const },
    { text: value, fontSize: 9, alignment: 'left' as const },
  ];
  const body: Content[][] = [];
  for (let i = 0; i < filled.length; i += 2) {
    const [a, b] = [filled[i], filled[i + 1]];
    body.push([...cell(a[0], a[1]), ...(b ? cell(b[0], b[1]) : [{ text: '' }, { text: '' }])]);
  }
  return {
    table: { widths: ['21%', '29%', '21%', '29%'], body },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => '#E8DCD8',
      paddingTop: () => 3,
      paddingBottom: () => 3,
    },
    margin: [0, 0, 0, 6],
  };
}
