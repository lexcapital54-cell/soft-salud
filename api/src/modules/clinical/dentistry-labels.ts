/** Etiquetas de la historia odontológica para PDF y RDA (espejo de admin/dentistry.models). */

export const DENTAL_SERVICE_LABELS: Record<string, string> = {
  GENERAL: 'Odontología general',
  REHABILITACION: 'Rehabilitación oral',
  ENDODONCIA: 'Endodoncia',
  PERIODONCIA: 'Periodoncia',
  CIRUGIA_ORAL: 'Cirugía oral',
  ORTODONCIA: 'Ortodoncia',
  ODONTOLOGIA: 'Odontología general',
};

export const DENTAL_MEDICAL_CONDITION_LABELS: Record<string, string> = {
  hypertension: 'Hipertensión',
  diabetes: 'Diabetes',
  cardiovascular: 'Enfermedades cardiovasculares',
  respiratory: 'Enfermedades respiratorias',
  renal: 'Enfermedades renales',
  hepatic: 'Enfermedades hepáticas',
  infectious: 'Enfermedades infecciosas',
  coagulation: 'Alteraciones de coagulación',
  epilepsy: 'Epilepsia',
  osteoporosis: 'Osteoporosis',
  pregnancy: 'Embarazo',
  other: 'Otras condiciones',
};

export const DENTAL_ALLERGY_LABELS: Record<string, string> = {
  none: 'No refiere alergias',
  medications: 'Medicamentos',
  food: 'Alimentos',
  latex: 'Látex',
  anesthetics: 'Anestésicos',
  other: 'Otras',
  unknown: 'Desconoce',
};

export const DENTAL_MEDICATION_GROUP_LABELS: Record<string, string> = {
  anticoagulants: 'Anticoagulantes',
  antiplatelets: 'Antiagregantes',
  bisphosphonates: 'Bisfosfonatos',
  corticosteroids: 'Corticoides',
  antibiotics: 'Antibióticos',
  other: 'Otros',
};

export const DENTAL_TREATMENT_LABELS: Record<string, string> = {
  orthodontics: 'Ortodoncia previa',
  endodontics: 'Endodoncia',
  extractions: 'Extracciones',
  implants: 'Implantes',
  prosthesis: 'Prótesis',
  surgeries: 'Cirugías orales',
  trauma: 'Traumatismos dentales',
};

export const DENTAL_SYMPTOM_LABELS: Record<string, string> = {
  bruxism: 'Bruxismo',
  sensitivity: 'Sensibilidad dental',
  bleeding: 'Sangrado gingival',
  pain: 'Dolor dental',
  halitosis: 'Halitosis',
};

export const DENTAL_HABIT_LABELS: Record<string, string> = {
  bruxism: 'Bruxismo',
  onychophagia: 'Onicofagia',
  mouthBreathing: 'Respiración oral',
  thumbSucking: 'Succión digital',
  pacifier: 'Uso prolongado de chupete',
  tongueThrust: 'Interposición lingual',
  lipBiting: 'Mordisqueo de labios',
  objectBiting: 'Mordisqueo de objetos',
  other: 'Otros',
};

export const ORTHO_HABIT_LABELS: Record<string, string> = {
  mouthBreathing: 'Respiración oral',
  atypicalSwallowing: 'Deglución atípica',
  tongueThrust: 'Interposición lingual',
  thumbSucking: 'Succión digital',
  bruxism: 'Bruxismo',
};

export const DENTAL_CONSENT_LABELS: Record<string, string> = {
  ODO_INFORMED: 'Tratamiento odontológico general',
  ODO_EXTRACTION: 'Extracción dental',
  ODO_ORAL_SURGERY: 'Cirugía oral',
  ODO_ENDODONTICS: 'Endodoncia',
  ODO_PERIODONTICS: 'Periodoncia',
  ODO_ORTHODONTICS: 'Ortodoncia',
  ODO_PHOTOS: 'Fotografías clínicas',
  ODO_IMAGE_USE: 'Uso de imágenes con autorización',
  ODO_ANESTHESIA: 'Anestesia local',
  ODO_AESTHETIC: 'Procedimientos estéticos',
  ODO_TELEHEALTH: 'Atención virtual',
  HABEAS_DATA: 'Tratamiento de datos (Habeas Data)',
};

export const DENTAL_TREATMENT_STATUS_LABELS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_TRATAMIENTO: 'En tratamiento',
  TERMINADO: 'Terminado',
  CANCELADO: 'Cancelado',
};

export const DENTAL_ORDER_TYPE_LABELS: Record<string, string> = {
  RADIOGRAFIA: 'Radiografía / imagen',
  LABORATORIO: 'Laboratorio',
  INTERCONSULTA: 'Interconsulta',
  REMISION: 'Remisión',
  OTRO: 'Otro',
};

/** Hallazgos del odontograma (incluye los valores del formato v1). */
export const DENTAL_TOOTH_LABELS: Record<string, string> = {
  CARIES: 'Caries',
  RESTAURACION: 'Restauración',
  SELLANTE: 'Sellante',
  FRACTURA: 'Fractura',
  ENDODONCIA: 'Endodoncia',
  CORONA: 'Corona',
  PROTESIS: 'Prótesis',
  IMPLANTE: 'Implante',
  AUSENTE: 'Ausente',
  EXTRACCION_INDICADA: 'Extracción indicada',
  INCLUIDO: 'Diente incluido',
  MOVILIDAD: 'Movilidad',
  FISTULA: 'Fístula',
  LESION: 'Lesión periodontal',
  TRAUMA: 'Trauma',
  BRACKET: 'Bracket',
  BANDA: 'Banda',
  SEPARADOR: 'Separador',
  OTRO: 'Otra observación',
  SANO: 'Sano',
  CARIADO: 'Caries',
  OBTURADO: 'Restauración',
};
