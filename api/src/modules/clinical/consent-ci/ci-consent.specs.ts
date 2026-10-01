import { CiCheckItem, CiConsentCode, CiConsentSpec } from './ci-consent.types';

const COMMON_DECLARATIONS: CiCheckItem[] = [
  {
    key: 'informedClearly',
    label: 'Recibí la información en lenguaje claro',
    detail:
      'El profesional me explicó el diagnóstico, el procedimiento, sus beneficios y riesgos en términos comprensibles.',
  },
  {
    key: 'alternatives',
    label: 'Conozco las alternativas, incluida la de no tratarme',
    detail:
      'Se me explicaron otras opciones terapéuticas y las consecuencias de no realizar el procedimiento.',
  },
  {
    key: 'questionsResolved',
    label: 'Pude hacer preguntas y fueron resueltas',
    detail: 'Tuve tiempo suficiente para leer, preguntar y decidir sin presión.',
  },
  {
    key: 'truthfulHistory',
    label: 'Informé verazmente mis antecedentes',
    detail:
      'Declaré enfermedades, alergias, medicamentos, embarazo y hábitos; entiendo que ocultarlos aumenta los riesgos.',
  },
  {
    key: 'noGuarantee',
    label: 'Entiendo que no se garantizan resultados',
    detail:
      'La odontología no es una ciencia exacta: el profesional se compromete a poner todos los medios, no a un resultado.',
  },
  {
    key: 'revocable',
    label: 'Sé que puedo revocar este consentimiento',
    detail:
      'Puedo retirar mi autorización en cualquier momento, por escrito, sin afectar la atención ya prestada.',
  },
];

const GENERAL: CiConsentSpec = {
  kind: 'CI',
  code: 'CI-OD-001',
  professionalRole: 'Odontólogo(a) general',
  teeth: 'optional',
  teethLabel: 'Dientes a intervenir (opcional si es valoración general)',
  options: [
    {
      key: 'procedures',
      label: 'Procedimientos autorizados',
      multiple: true,
      required: true,
      choices: [
        { value: 'VALORACION', label: 'Valoración, examen clínico y diagnóstico' },
        { value: 'RADIOGRAFIAS', label: 'Radiografías intraorales / panorámica' },
        { value: 'PROFILAXIS', label: 'Profilaxis y detartraje' },
        { value: 'PREVENCION', label: 'Sellantes y flúor' },
        { value: 'OPERATORIA', label: 'Operatoria (resinas / ionómeros)' },
        { value: 'ENDODONCIA', label: 'Endodoncia' },
        { value: 'PERIODONCIA', label: 'Raspaje y alisado radicular' },
        { value: 'PROTESIS', label: 'Prótesis fija o removible' },
        { value: 'URGENCIA', label: 'Atención de urgencia' },
      ],
    },
    {
      key: 'anesthesia',
      label: 'Anestesia',
      multiple: false,
      required: true,
      choices: [
        { value: 'NINGUNA', label: 'Sin anestesia' },
        { value: 'INFILTRATIVA', label: 'Local infiltrativa' },
        { value: 'TRONCULAR', label: 'Local troncular (bloqueo)' },
      ],
    },
  ],
  risks: [
    { key: 'sensitivity', label: 'Sensibilidad dental postoperatoria', detail: 'Al frío, calor o al morder; suele ser transitoria.' },
    { key: 'painSwelling', label: 'Dolor, inflamación o sangrado leve', detail: 'Propios de la manipulación de tejidos.' },
    { key: 'anesthesiaReaction', label: 'Reacciones a la anestesia local', detail: 'Hematoma, mareo, taquicardia, alergia (rara) o mordedura accidental del labio/lengua.' },
    { key: 'paresthesia', label: 'Parestesia transitoria', detail: 'Adormecimiento prolongado del labio o la lengua tras un bloqueo; excepcionalmente persistente.' },
    { key: 'fracture', label: 'Fractura de restauraciones o del diente', detail: 'Especialmente en dientes con gran destrucción o tratados con endodoncia.' },
    { key: 'additionalTreatment', label: 'Necesidad de tratamientos adicionales', detail: 'Una caries profunda puede requerir endodoncia, corona o extracción.' },
    { key: 'radiation', label: 'Exposición mínima a radiación', detail: 'Las radiografías usan dosis bajas con protección; informe si está en embarazo.' },
  ],
  declarations: COMMON_DECLARATIONS,
};

const ORTHODONTICS: CiConsentSpec = {
  kind: 'CI',
  code: 'CI-ORT-002',
  professionalRole: 'Ortodoncista',
  teeth: 'optional',
  teethLabel: 'Dientes con indicación de extracción u otro procedimiento (si aplica)',
  options: [
    {
      key: 'appliance',
      label: 'Aparatología principal',
      multiple: false,
      required: true,
      choices: [
        { value: 'BRACKETS_METALICOS', label: 'Brackets metálicos convencionales' },
        { value: 'BRACKETS_AUTOLIGADO', label: 'Brackets de autoligado' },
        { value: 'BRACKETS_ESTETICOS', label: 'Brackets estéticos (cerámica / zafiro)' },
        { value: 'BRACKETS_LINGUALES', label: 'Brackets linguales' },
        { value: 'ALINEADORES', label: 'Alineadores transparentes' },
        { value: 'ORTOPEDIA', label: 'Ortopedia maxilar (funcional / removible)' },
      ],
    },
    {
      key: 'auxiliaries',
      label: 'Procedimientos auxiliares indicados',
      multiple: true,
      required: false,
      choices: [
        { value: 'MINIIMPLANTES', label: 'Mini implantes de anclaje (DAT / TAD)' },
        { value: 'EXPANSOR', label: 'Expansor palatino' },
        { value: 'ELASTICOS', label: 'Elásticos intermaxilares' },
        { value: 'DESGASTE', label: 'Desgaste interproximal (stripping)' },
        { value: 'EXTRACCIONES', label: 'Extracciones con fines ortodóncicos' },
        { value: 'ORTOGNATICA', label: 'Cirugía ortognática combinada' },
      ],
    },
    {
      key: 'retention',
      label: 'Retención planeada',
      multiple: false,
      required: true,
      choices: [
        { value: 'FIJA', label: 'Retenedor fijo (lingual)' },
        { value: 'HAWLEY', label: 'Retenedor removible tipo Hawley' },
        { value: 'ESSIX', label: 'Retenedor removible termoformado' },
        { value: 'COMBINADA', label: 'Combinada (fijo + removible)' },
      ],
    },
    {
      key: 'duration',
      label: 'Duración estimada',
      multiple: false,
      required: true,
      hint: 'Orientativa: depende del crecimiento y la colaboración.',
      choices: [
        { value: 'HASTA_12', label: 'Hasta 12 meses' },
        { value: '12_24', label: '12 a 24 meses' },
        { value: '24_36', label: '24 a 36 meses' },
        { value: 'MAS_36', label: 'Más de 36 meses' },
      ],
    },
  ],
  risks: [
    { key: 'rootResorption', label: 'Reabsorción radicular', detail: 'Acortamiento de las raíces; generalmente leve, puede ser severo en casos predispuestos y es irreversible.' },
    { key: 'whiteSpots', label: 'Manchas blancas y caries', detail: 'Descalcificación del esmalte alrededor de la aparatología por higiene deficiente o dieta rica en azúcares.' },
    { key: 'relapse', label: 'Recidiva', detail: 'Los dientes tienden a volver a su posición inicial, aun con un tratamiento exitoso.' },
    { key: 'retainers', label: 'Uso obligatorio de retenedores', detail: 'La retención es indefinida; no usarla según indicación anula los resultados.' },
    { key: 'periodontal', label: 'Inflamación gingival y recesión', detail: 'Encías inflamadas o retraídas, sobre todo con placa bacteriana acumulada.' },
    { key: 'tmj', label: 'Molestias en la articulación temporomandibular', detail: 'Pueden aparecer o persistir durante o después del tratamiento.' },
    { key: 'softTissue', label: 'Dolor y lesiones en mucosas', detail: 'Molestias tras los controles, úlceras por roce y aparatología suelta.' },
    { key: 'pulp', label: 'Afectación pulpar ocasional', detail: 'Dientes con traumas o restauraciones grandes pueden requerir endodoncia.' },
    { key: 'duration', label: 'La duración puede extenderse', detail: 'Inasistencia, daños de la aparatología o mala colaboración prolongan el tratamiento.' },
  ],
  declarations: COMMON_DECLARATIONS,
};

const ORAL_SURGERY: CiConsentSpec = {
  kind: 'CI',
  code: 'CI-CIR-003',
  professionalRole: 'Cirujano(a) oral',
  teeth: 'required',
  teethLabel: 'Dientes a extraer o zona a intervenir (obligatorio)',
  options: [
    {
      key: 'procedures',
      label: 'Procedimiento',
      multiple: true,
      required: true,
      choices: [
        { value: 'EXODONCIA_SIMPLE', label: 'Exodoncia simple' },
        { value: 'EXODONCIA_QUIRURGICA', label: 'Exodoncia quirúrgica (colgajo / osteotomía)' },
        { value: 'TERCER_MOLAR', label: 'Tercer molar incluido o semi-incluido' },
        { value: 'CANINO_INCLUIDO', label: 'Canino incluido (exposición / tracción)' },
        { value: 'FRENECTOMIA', label: 'Frenectomía' },
        { value: 'BIOPSIA', label: 'Biopsia' },
        { value: 'REGULARIZACION', label: 'Regularización ósea (alveoloplastia)' },
        { value: 'DRENAJE', label: 'Drenaje de absceso' },
      ],
    },
    {
      key: 'indication',
      label: 'Indicación de la extracción / cirugía',
      multiple: true,
      required: true,
      choices: [
        { value: 'CARIES', label: 'Caries no restaurable' },
        { value: 'PERIODONTAL', label: 'Enfermedad periodontal avanzada' },
        { value: 'FRACTURA', label: 'Fractura dental' },
        { value: 'ORTODONCICA', label: 'Indicación ortodóncica' },
        { value: 'INFECCION', label: 'Infección / pericoronaritis' },
        { value: 'PROFILACTICA', label: 'Preventiva (tercer molar)' },
        { value: 'PATOLOGIA', label: 'Lesión quística o tumoral' },
      ],
    },
    {
      key: 'anesthesia',
      label: 'Anestesia',
      multiple: false,
      required: true,
      choices: [
        { value: 'LOCAL', label: 'Local' },
        { value: 'LOCAL_SEDACION', label: 'Local + sedación (en ámbito habilitado)' },
        { value: 'GENERAL', label: 'General (remisión a institución habilitada)' },
      ],
    },
  ],
  risks: [
    { key: 'painSwelling', label: 'Dolor, inflamación y hematoma', detail: 'Mayores en cirugías de terceros molares; ceden en 3 a 7 días.' },
    { key: 'trismus', label: 'Limitación de la apertura bucal (trismo)', detail: 'Transitoria, por inflamación muscular.' },
    { key: 'bleeding', label: 'Sangrado', detail: 'Leve las primeras horas; mayor si toma anticoagulantes o tiene alteraciones de coagulación.' },
    { key: 'infection', label: 'Infección y alveolitis (alvéolo seco)', detail: 'Más frecuente en fumadores o sin seguir las indicaciones.' },
    { key: 'nerveInjury', label: 'Lesión del nervio dentario inferior o lingual', detail: 'Adormecimiento del labio, mentón o lengua; usualmente transitorio, excepcionalmente permanente.' },
    { key: 'sinus', label: 'Comunicación oroantral', detail: 'Apertura hacia el seno maxilar en piezas superiores; puede requerir cierre quirúrgico.' },
    { key: 'rootFracture', label: 'Fractura radicular o del hueso alveolar', detail: 'Puede quedar un fragmento de raíz, que el profesional decidirá retirar o controlar.' },
    { key: 'adjacentDamage', label: 'Daño a dientes vecinos o restauraciones', detail: 'Por la fuerza aplicada durante la extracción.' },
    { key: 'jawFracture', label: 'Fractura mandibular (excepcional)', detail: 'En dientes profundamente incluidos o hueso debilitado.' },
    { key: 'medication', label: 'Reacciones a anestesia o medicamentos', detail: 'Alergias o efectos adversos de analgésicos y antibióticos formulados.' },
  ],
  declarations: COMMON_DECLARATIONS,
};

export const CI_CONSENT_SPECS: Record<CiConsentCode, CiConsentSpec> = {
  'CI-OD-001': GENERAL,
  'CI-ORT-002': ORTHODONTICS,
  'CI-CIR-003': ORAL_SURGERY,
};
