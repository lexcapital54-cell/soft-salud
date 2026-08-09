import { DocumentPillar, PrismaClient } from '@prisma/client';

/**
 * Requisitos del SG-SST para el consultorio de psicología.
 *
 * La lista sale de los estándares mínimos de la Resolución 0312 de 2019 para
 * empresas de menos de diez trabajadores con riesgo I-III, y del Decreto 1072
 * de 2015 (Libro 2, Parte 2, Título 4, Capítulo 6). `validityDays` marca cada
 * cuánto caduca la evidencia: 365 para lo anual, 30 para lo mensual y nulo
 * para lo que solo se genera cuando ocurre el hecho (accidentes, FURAT).
 */
const SGSST_CATEGORIES = [
  { code: 'SST_01_PLANEACION', name: 'SG-SST · Planeación y política', sortOrder: 13 },
  { code: 'SST_02_RIESGOS', name: 'SG-SST · Identificación de peligros', sortOrder: 14 },
  { code: 'SST_03_OPERACION', name: 'SG-SST · Programas y operación', sortOrder: 15 },
  { code: 'SST_04_VERIFICACION', name: 'SG-SST · Verificación y mejora', sortOrder: 16 },
] as const;

type SgsstRequirement = {
  categoryCode: (typeof SGSST_CATEGORIES)[number]['code'];
  code: string;
  title: string;
  description: string;
  validityDays: number | null;
  isMandatory?: boolean;
};

const SGSST_REQUIREMENTS: SgsstRequirement[] = [
  // Planeación y política
  {
    categoryCode: 'SST_01_PLANEACION',
    code: 'SST_POLITICA_SST',
    title: 'Política de Seguridad y Salud en el Trabajo',
    description: 'Firmada por el empleador y revisada anualmente (Res. 0312, estándar 2.1.1).',
    validityDays: 365,
  },
  {
    categoryCode: 'SST_01_PLANEACION',
    code: 'SST_ACTA_NOMBRAMIENTO_RESPONSABLE',
    title: 'Acta de nombramiento del responsable del SG-SST',
    description: 'Designación por escrito del responsable y su carta de aceptación.',
    validityDays: null,
  },
  {
    categoryCode: 'SST_01_PLANEACION',
    code: 'SST_OBJETIVOS',
    title: 'Objetivos del SG-SST',
    description: 'Medibles, coherentes con la política y revisados cada año.',
    validityDays: 365,
  },
  {
    categoryCode: 'SST_01_PLANEACION',
    code: 'SST_PLAN_ANUAL_TRABAJO',
    title: 'Plan anual de trabajo',
    description: 'Con metas, responsables, recursos y cronograma (estándar 2.4.1).',
    validityDays: 365,
  },
  {
    categoryCode: 'SST_01_PLANEACION',
    code: 'SST_MATRIZ_LEGAL',
    title: 'Matriz legal MAT-LEG-01',
    description: 'Normativa aplicable al consultorio, actualizada al menos una vez al año.',
    validityDays: 365,
  },
  {
    categoryCode: 'SST_01_PLANEACION',
    code: 'SST_EVALUACION_INICIAL',
    title: 'Evaluación inicial o prediagnóstico',
    description: 'Línea base del sistema, requisito de entrada del Dec. 1072.',
    validityDays: null,
  },
  {
    categoryCode: 'SST_01_PLANEACION',
    code: 'SST_POLITICA_ACOSO_LABORAL',
    title: 'Política de prevención del acoso laboral',
    description: 'Ley 1010 de 2006 y conformación del comité de convivencia.',
    validityDays: 365,
  },
  {
    categoryCode: 'SST_01_PLANEACION',
    code: 'SST_POLITICA_DESCONEXION',
    title: 'Política de desconexión laboral',
    description: 'Ley 2191 de 2022, obligatoria para todo empleador.',
    validityDays: 365,
  },

  // Identificación de peligros
  {
    categoryCode: 'SST_02_RIESGOS',
    code: 'SST_MATRIZ_PELIGROS',
    title: 'Matriz de identificación de peligros MAT-RGO-01',
    description: 'Metodología GTC 45, actualizada cada año o ante cambios (estándar 4.1.2).',
    validityDays: 365,
  },
  {
    categoryCode: 'SST_02_RIESGOS',
    code: 'SST_RIESGO_PSICOSOCIAL',
    title: 'Programa de gestión del riesgo psicosocial',
    description: 'Res. 2646 de 2008. Crítico en psicología por la exposición del profesional.',
    validityDays: 365,
  },
  {
    categoryCode: 'SST_02_RIESGOS',
    code: 'SST_RIESGO_BIOMECANICO',
    title: 'Programa de riesgo biomecánico y ergonomía',
    description: 'Puestos de trabajo con exposición prolongada a postura sedente.',
    validityDays: 365,
  },

  // Programas y operación
  {
    categoryCode: 'SST_03_OPERACION',
    code: 'SST_CRONOGRAMA_CAPACITACION',
    title: 'Cronograma anual de capacitación',
    description: 'Incluye inducción y reinducción en SG-SST (estándar 1.2.1).',
    validityDays: 365,
  },
  {
    categoryCode: 'SST_03_OPERACION',
    code: 'SST_ACTAS_CAPACITACION',
    title: 'Actas de capacitación del mes',
    description: 'Registro mensual con firma del capacitador y de los asistentes.',
    validityDays: 30,
  },
  {
    categoryCode: 'SST_03_OPERACION',
    code: 'SST_PAUSAS_ACTIVAS',
    title: 'Registro de pausas activas del mes',
    description: 'Planilla mensual firmada por los participantes.',
    validityDays: 30,
  },
  {
    categoryCode: 'SST_03_OPERACION',
    code: 'SST_INSPECCION_EXTINTORES',
    title: 'Inspección de extintores',
    description: 'Chequeo visual mensual de carga, presión y señalización.',
    validityDays: 30,
  },
  {
    categoryCode: 'SST_03_OPERACION',
    code: 'SST_INSPECCION_BOTIQUIN',
    title: 'Inspección de botiquín',
    description: 'Chequeo mensual de dotación y fechas de vencimiento (Res. 0705 de 2007).',
    validityDays: 30,
  },
  {
    categoryCode: 'SST_03_OPERACION',
    code: 'SST_PLAN_EMERGENCIAS',
    title: 'Plan de prevención, preparación y respuesta ante emergencias',
    description: 'Con plano de evacuación y directorio de emergencia (estándar 5.1.1).',
    validityDays: 365,
  },
  {
    categoryCode: 'SST_03_OPERACION',
    code: 'SST_SIMULACRO',
    title: 'Informe del simulacro de evacuación',
    description: 'Al menos uno al año, con registro de asistencia y evaluación.',
    validityDays: 365,
  },
  {
    categoryCode: 'SST_03_OPERACION',
    code: 'SST_MEDICINA_PREVENTIVA',
    title: 'Programa de medicina preventiva y del trabajo',
    description: 'Incluye exámenes médicos ocupacionales de ingreso, periódicos y de retiro.',
    validityDays: 365,
  },
  {
    categoryCode: 'SST_03_OPERACION',
    code: 'SST_GESTION_CONTRATISTAS',
    title: 'Programa de gestión de contratistas',
    description: 'Verificación de afiliación a la ARL de proveedores y contratistas.',
    validityDays: 365,
  },
  {
    categoryCode: 'SST_03_OPERACION',
    code: 'SST_GESTION_CAMBIO',
    title: 'Procedimiento de gestión del cambio',
    description: 'Evaluación del impacto en SST ante cambios de sede, equipos o personal.',
    validityDays: null,
  },

  // Verificación y mejora
  {
    categoryCode: 'SST_04_VERIFICACION',
    code: 'SST_AUTOEVALUACION_0312',
    title: 'Autoevaluación de estándares mínimos (Res. 0312)',
    description: 'Obligatoria cada diciembre; su resultado alimenta el plan de mejora.',
    validityDays: 365,
  },
  {
    categoryCode: 'SST_04_VERIFICACION',
    code: 'SST_INDICADORES',
    title: 'Manual de indicadores del SG-SST',
    description: 'Indicadores de estructura, proceso y resultado (Dec. 1072, art. 2.2.4.6.19).',
    validityDays: 365,
  },
  {
    categoryCode: 'SST_04_VERIFICACION',
    code: 'SST_AUDITORIA_INTERNA',
    title: 'Auditoría interna anual del SG-SST',
    description: 'Programa e informe de auditoría (estándar 6.1.2).',
    validityDays: 365,
  },
  {
    categoryCode: 'SST_04_VERIFICACION',
    code: 'SST_REVISION_DIRECCION',
    title: 'Revisión por la alta dirección',
    description: 'Acta anual con conclusiones y decisiones sobre el sistema.',
    validityDays: 365,
  },
  {
    categoryCode: 'SST_04_VERIFICACION',
    code: 'SST_PLAN_MEJORAMIENTO',
    title: 'Plan de mejoramiento del SG-SST',
    description: 'Acciones correctivas derivadas de la autoevaluación y las auditorías.',
    validityDays: 365,
  },
  {
    categoryCode: 'SST_04_VERIFICACION',
    code: 'SST_REPORTE_ACCIDENTES',
    title: 'Reporte de accidentes e incidentes de trabajo',
    description: 'Investigación interna del evento; se genera solo cuando ocurre.',
    validityDays: null,
    isMandatory: false,
  },
  {
    categoryCode: 'SST_04_VERIFICACION',
    code: 'SST_FURAT',
    title: 'FURAT radicado ante la ARL',
    description: 'Reporte dentro de los dos días hábiles siguientes al accidente (Dec. 1072).',
    validityDays: null,
    isMandatory: false,
  },
];

export async function seedSgsstRequirements(prisma: PrismaClient) {
  const categoryIdByCode = new Map<string, string>();

  for (const category of SGSST_CATEGORIES) {
    const saved = await prisma.documentCategory.upsert({
      where: { code: category.code },
      create: { ...category, pillar: DocumentPillar.SG_SST },
      update: {
        name: category.name,
        sortOrder: category.sortOrder,
        pillar: DocumentPillar.SG_SST,
      },
    });
    categoryIdByCode.set(category.code, saved.id);
  }

  const clinics = await prisma.clinic.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  let upserted = 0;
  for (const clinic of clinics) {
    for (const req of SGSST_REQUIREMENTS) {
      const categoryId = categoryIdByCode.get(req.categoryCode);
      if (!categoryId) continue;

      await prisma.documentRequirement.upsert({
        where: { clinicId_code: { clinicId: clinic.id, code: req.code } },
        create: {
          clinicId: clinic.id,
          categoryId,
          code: req.code,
          title: req.title,
          description: req.description,
          isMandatory: req.isMandatory ?? true,
          validityDays: req.validityDays,
        },
        update: {
          categoryId,
          title: req.title,
          description: req.description,
          isMandatory: req.isMandatory ?? true,
          validityDays: req.validityDays,
        },
      });
      upserted += 1;
    }
  }

  return {
    categories: SGSST_CATEGORIES.length,
    requirements: SGSST_REQUIREMENTS.length,
    clinics: clinics.length,
    upserted,
  };
}
