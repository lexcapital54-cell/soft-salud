/**
 * CUPS de ortodoncia agrupados por etapa clínica (referencial: validar contra la resolución CUPS vigente).
 * Se guarda el código de seis dígitos que exige RIPS; `notation` es la forma con puntos de la CUPS.
 */
export const CUPS_CATALOG_VERSION = process.env.CUPS_CATALOG_VERSION?.trim() || 'CUPS 2026';

export interface OrthoCupsStage {
  stage: string;
  items: Array<{ code: string; description: string; notation?: string }>;
}

export const ORTHO_CUPS_CATALOG: OrthoCupsStage[] = [
  {
    stage: 'Consulta',
    items: [
      { code: '890222', description: 'Consulta de primera vez por especialista en ortodoncia' },
      { code: '890322', description: 'Consulta de control o seguimiento por especialista en ortodoncia' },
      { code: '890422', description: 'Interconsulta por especialista en ortodoncia' },
    ],
  },
  {
    stage: 'Diagnóstico y estudio',
    items: [
      { code: '893103', description: 'Evaluación y medición ortodóntica y ortopédica oral' },
      { code: '893104', description: 'Estudio de oclusión y articulación temporomandibular' },
      { code: '893101', description: 'Impresión de arco dentario superior o inferior con modelo de estudio y concepto' },
      { code: '893102', description: 'Fotografía clínica extraoral o intraoral' },
      { code: '893105', description: 'Máscara facial diagnóstica' },
    ],
  },
  {
    stage: 'Instalación de aparatología',
    items: [
      { code: '247101', notation: '24.7.1.01', description: 'Colocación de aparatología fija para ortodoncia (arcada)' },
      { code: '247201', notation: '24.7.2.01', description: 'Colocación de aparatología removible intraoral para ortodoncia (arcada)' },
      { code: '247202', notation: '24.7.2.02', description: 'Colocación de aparatología removible extraoral para ortodoncia (arcada)' },
      { code: '893107', description: 'Elaboración y adaptación de aparato ortopédico' },
      { code: '247001', notation: '24.7.0.01', description: 'Colocación de anclaje temporal esquelético' },
    ],
  },
  {
    stage: 'Controles',
    items: [
      { code: '893106', description: 'Control de ortodoncia fija, removible o tratamiento ortopédico funcional y mecánico' },
      { code: '893108', description: 'Control de crecimiento y desarrollo dentomaxilofacial' },
      { code: '935501', description: 'Aplicación de alambre dental' },
    ],
  },
  {
    stage: 'Otros procedimientos ortodónticos',
    items: [
      { code: '248101', notation: '24.8.1.01', description: 'Cierre de diastema (alveolar, dental)' },
      { code: '248201', notation: '24.8.2.01', description: 'Ajustamiento oclusal' },
      { code: '248401', notation: '24.8.4.01', description: 'Reparación de aparatología fija o removible' },
      { code: '248801', notation: '24.8.8.01', description: 'Colocación de máscara facial terapéutica' },
    ],
  },
  {
    stage: 'Ferulización',
    items: [
      { code: '247401', notation: '24.7.4.01', description: 'Ferulización rígida superior o inferior' },
      { code: '247402', notation: '24.7.4.02', description: 'Ferulización semirrígida superior o inferior' },
      { code: '247403', notation: '24.7.4.03', description: 'Ferulización' },
    ],
  },
  {
    stage: 'Retiro y retención',
    items: [
      { code: '973401', description: 'Extracción de aparatología ortodóntica fija' },
      { code: '247301', notation: '24.7.3.01', description: 'Colocación de aparatos de retención' },
    ],
  },
];

export function orthoCupsRows() {
  return ORTHO_CUPS_CATALOG.flatMap(({ stage, items }) =>
    items.map((item) => ({ ...item, category: item.notation ? `${stage} · ${item.notation}` : stage })),
  );
}
