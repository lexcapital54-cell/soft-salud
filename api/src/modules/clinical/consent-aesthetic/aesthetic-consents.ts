import { ClinicSpecialty, PrismaClient } from '@prisma/client';

/**
 * Consentimientos de medicina estética tomados de los formatos de la Dra. Gladys
 * Quintero (versión enero 2026). Nombre del consultorio, paciente y profesional
 * se completan al firmar; los códigos CI-EST se conservan en el título.
 */
type AesConsent = { code: string; title: string; bodyHtml: string };

const ul = (items: string[]) => `<ul>\n${items.map((i) => `    <li>${i}</li>`).join('\n')}\n  </ul>`;

function header(heading: string, areas: string) {
  return `
  <h2>${heading}</h2>
  <p><strong>Ciudad y Fecha:</strong> ___________________________</p>
  <p>Yo, ________________________________________________, identificado(a) con C.C. / C.E. / T.I. No. _________________, obrando en nombre propio o como representante legal del paciente ________________________________________________, declaro que he sido informado(a) de manera clara por el/la médico(a) _____________________________________, con Registro Profesional No. ______________, sobre el procedimiento descrito a continuación.</p>
  <p><strong>Áreas a tratar:</strong> ${areas}</p>`;
}

const DISCLOSURE = `
  <p>No he ocultado ni alterado información sobre ninguna condición médica pasada o actual. En caso de haber omitido alguna información clínica importante para el profesional de la salud, asumo las consecuencias que pueda traer dicha omisión.</p>
  <p>Doy mi permiso al médico para que se me tomen fotografías o se me filme antes, durante y después del procedimiento, para que se utilice mi imagen gratuitamente, permaneciendo resguardada mi identidad, sin poder utilizar mi nombre ni mis datos de localización y utilizando solamente mis iniciales.</p>
  <p><strong>Entiendo que todos los pagos del procedimiento arriba mencionado no son reembolsables una vez realizado el tratamiento.</strong></p>
  <p>Puedo revocar este consentimiento antes del procedimiento, informándolo al profesional, sin que se afecte mi derecho a recibir atención en salud.</p>
  <p><strong>Abajo figura mi firma y certifico que he leído y entendido perfectamente los contenidos de esta autorización.</strong></p>`;

function ciEst(opts: {
  heading: string;
  areas: string;
  description: string[];
  contraindications: string[];
  riskIntro: string;
  frequent: string[];
  uncommon: string[];
  exceptional: string[];
  riskClosing: string;
  care: string[];
}) {
  return `
<section>${header(opts.heading, opts.areas)}
  <h3>1. Descripción del procedimiento</h3>
  ${opts.description.map((p) => `<p>${p}</p>`).join('\n  ')}
  <h3>2. Contraindicaciones absolutas</h3>
  <p>No se realizará el procedimiento si presenta alguna de las siguientes condiciones:</p>
  ${ul(opts.contraindications)}
  <h3>3. Riesgos y efectos secundarios previsibles</h3>
  <p>${opts.riskIntro}</p>
  <p><strong>Frecuentes y transitorios:</strong></p>
  ${ul(opts.frequent)}
  <p><strong>Poco frecuentes:</strong></p>
  ${ul(opts.uncommon)}
  <p><strong>Complicaciones excepcionales:</strong></p>
  ${ul(opts.exceptional)}
  <p>${opts.riskClosing}</p>
  <h3>4. Compromiso y deberes del paciente (cuidados posteriores)</h3>
  <p>Me comprometo a seguir las recomendaciones médicas indicadas:</p>
  ${ul(opts.care)}
${DISCLOSURE}
</section>`.trim();
}

function declarations(product: string) {
  return `
  <h3>Declaraciones del paciente</h3>
  <p>Declaro que:</p>
  ${ul([
    'He recibido información clara, suficiente y comprensible acerca del procedimiento.',
    'Comprendo los beneficios, riesgos, posibles complicaciones y alternativas.',
    'Se me explicó que pueden requerirse varias sesiones para obtener los resultados esperados.',
    'Todas mis preguntas fueron respondidas satisfactoriamente.',
    'Informé de manera completa mis antecedentes médicos, alergias, enfermedades y medicamentos que utilizo.',
    'Comprendo que puedo retirar este consentimiento antes del procedimiento sin afectar mi atención en salud.',
    `Autorizo libre y voluntariamente la realización del tratamiento con ${product}.`,
  ])}`;
}

const NO_GUARANTEE = 'Los resultados varían entre pacientes y dependen de factores individuales. No se garantiza un resultado específico.';

export const AESTHETIC_CONSENTS: AesConsent[] = [
  {
    code: 'HABEAS_DATA',
    title: 'Autorización para el tratamiento de datos personales y sensibles (Ley 1581 de 2012)',
    bodyHtml: `
<section>
  <h2>AUTORIZACIÓN PARA EL TRATAMIENTO DE DATOS PERSONALES Y SENSIBLES (LEY 1581 DE 2012)</h2>
  <p><strong>Ciudad y Fecha:</strong> ___________________________</p>
  <p>Yo, ________________________________________________, identificado(a) con C.C. / C.E. / T.I. No. _________________ de _________________, obrando en nombre propio o en representación legal del menor/paciente ________________________________________________, autorizo de manera previa, expresa e informada al consultorio / profesional tratante para realizar la recolección, almacenamiento, uso, circulación y supresión de mis datos personales y <strong>datos sensibles</strong>, conforme a la Ley 1581 de 2012 y el Decreto 1377 de 2013.</p>
  <h3>1. Finalidades</h3>
  ${ul([
    'Prestación de servicios de salud y de medicina estética (valoración, procedimientos y controles).',
    'Apertura, actualización y custodia de la historia clínica (Resolución 1995 de 1999).',
    'Registro fotográfico clínico antes, durante y después de los procedimientos, que hace parte de la historia clínica.',
    'Gestión administrativa: agendamiento, recordatorios por WhatsApp, correo o SMS, facturación y recibos.',
    'Cumplimiento de obligaciones legales y reportes a las autoridades competentes.',
  ])}
  <h3>2. Datos sensibles</h3>
  <p>Se me ha informado que los datos relativos a mi salud y mis fotografías clínicas son datos sensibles y que no estoy obligado(a) a autorizar su tratamiento para fines distintos a la prestación del servicio. Su uso con fines de divulgación requiere una autorización expresa adicional.</p>
  <h3>3. Derechos del titular</h3>
  <p>Puedo conocer, actualizar, rectificar y solicitar prueba de esta autorización; ser informado(a) del uso dado a mis datos; presentar quejas ante la Superintendencia de Industria y Comercio y revocar la autorización o pedir la supresión del dato, salvo cuando exista un deber legal de conservarlo, como la custodia de la historia clínica.</p>
  <p>Leído el presente documento, otorgo mi consentimiento libre, consciente y voluntario.</p>
</section>`.trim(),
  },
  {
    code: 'AES_TOXINA',
    title: 'Consentimiento informado para la aplicación de toxina botulínica tipo A (CI-EST-01)',
    bodyHtml: ciEst({
      heading: 'CONSENTIMIENTO INFORMADO PARA LA APLICACIÓN DE TOXINA BOTULÍNICA TIPO A (XEOMIN®) (CI-EST-01)',
      areas: 'facial',
      description: [
        'El tratamiento consiste en la aplicación de Toxina Botulínica Tipo A (Xeomin®), medicamento biológico aprobado para uso médico estético, mediante microinyecciones intramusculares en áreas específicas del rostro.',
        'Xeomin® actúa bloqueando temporalmente la liberación de acetilcolina en la unión neuromuscular, disminuyendo la contracción de los músculos responsables de las líneas de expresión dinámicas.',
        'El procedimiento tiene como objetivo suavizar las arrugas de expresión existentes, prevenir la profundización de nuevas líneas y mejorar la armonía facial, conservando la naturalidad de las expresiones cuando es aplicado correctamente.',
        'Los resultados suelen comenzar a observarse entre 3 y 7 días posteriores a la aplicación, alcanzando su efecto máximo aproximadamente a los 14 días. La duración puede variar entre 3 y 6 meses según las características individuales de cada paciente.',
        'Los resultados pueden variar según la fuerza muscular, metabolismo, edad, hábitos de vida y respuesta biológica individual.',
      ],
      contraindications: [
        'Embarazo o lactancia.',
        'Enfermedades neuromusculares (Miastenia Gravis, Síndrome de Eaton-Lambert u otras similares).',
        'Infección activa en la zona a tratar.',
        'Hipersensibilidad conocida a la Toxina Botulínica Tipo A o a cualquiera de sus componentes.',
        'Enfermedades sistémicas descompensadas.',
        'Procesos infecciosos agudos.',
        'Trastornos severos de coagulación.',
        'Uso de medicamentos que interfieran con la transmisión neuromuscular sin autorización médica.',
        'Antecedentes de reacción adversa grave a tratamientos previos con toxina botulínica.',
      ],
      riskIntro: 'He sido informado(a) de que, como cualquier procedimiento médico estético, la aplicación de Xeomin® puede presentar riesgos y efectos secundarios.',
      frequent: ['Dolor leve en los puntos de aplicación.', 'Eritema (enrojecimiento).', 'Edema (inflamación leve).', 'Sensibilidad local.', 'Cefalea transitoria.', 'Pequeños hematomas o equimosis.'],
      uncommon: ['Asimetrías faciales temporales.', 'Corrección insuficiente o excesiva.', 'Sensación de pesadez facial.', 'Alteraciones temporales de la expresión facial.', 'Visión borrosa transitoria.', 'Sequedad ocular o lagrimeo.'],
      exceptional: ['Ptosis palpebral (caída temporal del párpado).', 'Ptosis de ceja.', 'Diplopía (visión doble).', 'Reacciones alérgicas.', 'Debilidad muscular no deseada.', 'Difusión no prevista del producto a músculos adyacentes.'],
      riskClosing: 'Entiendo que, aunque estas complicaciones son poco frecuentes o excepcionales, ningún procedimiento médico está completamente libre de riesgos.',
      care: [
        'No acostarme durante las primeras 4 horas posteriores al procedimiento.',
        'Evitar masajear o manipular las áreas tratadas durante las primeras 24 horas.',
        'Evitar ejercicio físico intenso durante las primeras 24 horas.',
        'Evitar saunas, turcos, jacuzzis y exposición a calor excesivo durante las primeras 48 horas.',
        'Evitar consumo de alcohol durante las primeras 24 horas.',
        'Mantener una adecuada hidratación.',
        'Asistir a los controles médicos programados.',
        'Informar inmediatamente cualquier síntoma inusual o reacción adversa.',
      ],
    }),
  },
  {
    code: 'AES_RADIESSE',
    title: 'Consentimiento informado: bioestimulador de colágeno hidroxiapatita de calcio (Radiesse®) (CI-EST-02)',
    bodyHtml: ciEst({
      heading: 'CONSENTIMIENTO INFORMADO: BIOESTIMULADORES DE COLÁGENO, HIDROXIAPATITA DE CALCIO (RADIESSE®) (CI-EST-02)',
      areas: 'facial',
      description: [
        'El tratamiento consiste en la infiltración subdérmica de un implante inyectable a base de Hidroxiapatita de Calcio (Radiesse®), un biomaterial biocompatible y reabsorbible aprobado para uso médico estético.',
        'Radiesse® actúa mediante un doble mecanismo: proporciona soporte estructural inmediato en las zonas tratadas y estimula la producción natural de colágeno (neocolagénesis), mejorando progresivamente la firmeza, calidad y elasticidad de la piel.',
        'El objetivo del procedimiento es restaurar volumen perdido, mejorar la flacidez, redefinir contornos faciales y corporales, estimular colágeno y lograr un rejuvenecimiento natural y progresivo.',
        'Los resultados pueden variar según las características individuales de cada paciente, edad, hábitos de vida, metabolismo y cuidados posteriores.',
      ],
      contraindications: [
        'Embarazo o lactancia.',
        'Enfermedades autoinmunes activas o descompensadas.',
        'Infecciones activas en la zona a tratar.',
        'Herpes simple activo.',
        'Trastornos severos de coagulación.',
        'Uso de anticoagulantes sin autorización médica.',
        'Antecedentes de alergia conocida a cualquiera de los componentes del producto o a la lidocaína.',
        'Tendencia a formación de queloides o cicatrices hipertróficas.',
        'Enfermedades dermatológicas activas en la zona de aplicación.',
        'Procesos inflamatorios sistémicos activos.',
      ],
      riskIntro: 'He sido informado(a) de que, como cualquier procedimiento médico estético, la aplicación de Radiesse® puede presentar riesgos y efectos secundarios.',
      frequent: ['Inflamación (edema).', 'Enrojecimiento (eritema).', 'Dolor leve o moderado.', 'Sensibilidad local.', 'Picazón transitoria.', 'Hematomas o equimosis.', 'Endurecimiento temporal de la zona tratada.'],
      uncommon: ['Asimetrías.', 'Persistencia prolongada del edema.', 'Infección.', 'Reacciones inflamatorias tardías.', 'Formación de nódulos o granulomas.', 'Migración localizada del producto.'],
      exceptional: ['Oclusión vascular accidental.', 'Necrosis cutánea.', 'Alteraciones visuales.', 'Compromiso vascular severo.', 'Reacciones alérgicas graves.'],
      riskClosing: 'Entiendo que, aunque estas complicaciones son extremadamente infrecuentes, ningún procedimiento médico está completamente libre de riesgos.',
      care: [
        'Realizar los masajes recomendados por el profesional tratante cuando sean indicados.',
        'Evitar manipular excesivamente las áreas tratadas durante las primeras 24 horas.',
        'No exponerse a radiación solar intensa, saunas, turcos o fuentes de calor durante los primeros 7 días.',
        'Evitar ejercicio físico intenso durante las primeras 24 a 48 horas.',
        'Evitar consumo de alcohol durante las primeras 24 horas.',
        'Mantener adecuada hidratación.',
        'Asistir a los controles médicos programados.',
        'Informar inmediatamente cualquier síntoma inusual como dolor intenso, cambios de coloración, alteraciones visuales o inflamación excesiva.',
      ],
    }),
  },
  {
    code: 'AES_ACIDO_HIALURONICO',
    title: 'Consentimiento informado para infiltración subdérmica de ácido hialurónico reticulado (CI-EST-04)',
    bodyHtml: ciEst({
      heading: 'CONSENTIMIENTO INFORMADO PARA INFILTRACIÓN SUBDÉRMICA DE ÁCIDO HIALURÓNICO RETICULADO (CI-EST-04)',
      areas: 'facial',
      description: [
        'El tratamiento consiste en la infiltración subdérmica de Ácido Hialurónico Reticulado, un implante inyectable biocompatible, reabsorbible y de origen no animal, aprobado para uso médico estético.',
        'El Ácido Hialurónico Reticulado actúa aportando volumen, soporte estructural e hidratación a los tejidos tratados. Dependiendo de la zona y del producto utilizado, puede emplearse para restaurar volumen perdido, corregir surcos y arrugas, definir contornos faciales o mejorar la armonización del rostro.',
        'El objetivo del procedimiento es lograr una mejor proporción facial, corregir signos de envejecimiento y mejorar la apariencia estética manteniendo resultados naturales.',
        'Las zonas que pueden tratarse incluyen labios, surcos nasogenianos, líneas de marioneta, mentón, pómulos, mandíbula, ojeras y otras áreas faciales según criterio médico.',
        'Los resultados pueden variar según las características individuales de cada paciente, edad, metabolismo, hábitos de vida, anatomía facial y cuidados posteriores.',
      ],
      contraindications: [
        'Embarazo o lactancia.',
        'Enfermedades autoinmunes activas o descompensadas.',
        'Infecciones activas en la zona a tratar.',
        'Herpes simple activo.',
        'Trastornos severos de coagulación.',
        'Uso de anticoagulantes sin autorización médica.',
        'Hipersensibilidad conocida al ácido hialurónico o a cualquiera de los componentes del producto.',
        'Tendencia a formación de queloides o cicatrices hipertróficas.',
        'Enfermedades dermatológicas activas en la zona de aplicación.',
        'Procesos inflamatorios sistémicos activos.',
        'Presencia de implantes permanentes o materiales incompatibles en la zona a tratar según criterio médico.',
      ],
      riskIntro: 'He sido informado(a) de que, como cualquier procedimiento médico estético, la aplicación de ácido hialurónico reticulado puede presentar riesgos y efectos secundarios.',
      frequent: ['Inflamación (edema).', 'Enrojecimiento (eritema).', 'Dolor leve o moderado.', 'Sensibilidad local.', 'Picazón transitoria.', 'Hematomas o equimosis.', 'Asimetrías temporales.', 'Endurecimiento transitorio del área tratada.'],
      uncommon: ['Persistencia prolongada del edema.', 'Infección.', 'Reacciones inflamatorias tardías.', 'Formación de nódulos.', 'Irregularidades superficiales.', 'Migración localizada del producto.', 'Reacciones de hipersensibilidad.'],
      exceptional: ['Oclusión vascular accidental.', 'Isquemia tisular.', 'Necrosis cutánea.', 'Alteraciones visuales temporales o permanentes.', 'Ceguera.', 'Embolización vascular.', 'Compromiso vascular severo.', 'Reacciones alérgicas graves.'],
      riskClosing: 'Entiendo que, aunque estas complicaciones son extremadamente infrecuentes, ningún procedimiento médico está completamente libre de riesgos.',
      care: [
        'Evitar manipular o masajear las áreas tratadas durante las primeras 24 horas, salvo indicación médica.',
        'Evitar maquillaje durante las primeras 12 horas posteriores al procedimiento.',
        'No exponerse a radiación solar intensa, saunas, turcos o fuentes de calor durante los primeros 7 días.',
        'Evitar ejercicio físico intenso durante las primeras 24 a 48 horas.',
        'Evitar consumo de alcohol durante las primeras 24 horas.',
        'Mantener adecuada hidratación.',
        'Dormir preferiblemente boca arriba durante las primeras noches cuando el médico lo considere pertinente.',
        'Asistir a los controles médicos programados.',
        'Informar inmediatamente cualquier síntoma inusual como dolor intenso, cambios de coloración, aparición de áreas blanquecinas, alteraciones visuales o inflamación excesiva.',
      ],
    }),
  },
  {
    code: 'AES_SKINBOOSTER',
    title: 'Consentimiento informado para aplicación de ácido hialurónico no reticulado (Skinbooster) (CI-EST-05)',
    bodyHtml: ciEst({
      heading: 'CONSENTIMIENTO INFORMADO PARA APLICACIÓN DE ÁCIDO HIALURÓNICO NO RETICULADO (SKINBOOSTER) (CI-EST-05)',
      areas: 'facial',
      description: [
        'El tratamiento consiste en la aplicación intradérmica de Ácido Hialurónico No Reticulado (Skinbooster), una sustancia biocompatible y reabsorbible presente de forma natural en el organismo, diseñada para mejorar la hidratación, calidad y apariencia de la piel.',
        'El ácido hialurónico no reticulado actúa atrayendo y reteniendo agua en los tejidos, favoreciendo la hidratación profunda, mejorando la elasticidad cutánea y estimulando los procesos naturales de regeneración de la piel.',
        'El objetivo es mejorar la calidad, luminosidad, textura, hidratación y firmeza de la piel. A diferencia de los rellenos dérmicos convencionales, este tratamiento no busca generar volumen ni modificar la estructura facial.',
        'Los resultados pueden variar según las características individuales de cada paciente, edad, hábitos de vida, estado de la piel y cumplimiento de las recomendaciones posteriores.',
      ],
      contraindications: [
        'Embarazo o lactancia.',
        'Infección activa en la zona a tratar.',
        'Herpes simple activo.',
        'Enfermedades autoinmunes activas o descompensadas.',
        'Procesos inflamatorios activos.',
        'Trastornos severos de coagulación.',
        'Uso de anticoagulantes sin autorización médica.',
        'Hipersensibilidad conocida al ácido hialurónico o a cualquiera de los componentes del producto.',
        'Enfermedades dermatológicas activas en la zona de tratamiento.',
        'Fiebre o enfermedad infecciosa aguda.',
      ],
      riskIntro: 'He sido informado(a) de que, como cualquier procedimiento médico estético, la aplicación de Skinbooster puede presentar riesgos y efectos secundarios.',
      frequent: ['Inflamación (edema).', 'Enrojecimiento (eritema).', 'Dolor leve o moderado.', 'Sensibilidad local.', 'Picazón transitoria.', 'Pequeñas pápulas temporales en los puntos de aplicación.', 'Hematomas o equimosis.', 'Sensación de tensión o sensibilidad en la zona tratada.'],
      uncommon: ['Persistencia prolongada del edema.', 'Asimetrías temporales.', 'Infección local.', 'Reacciones inflamatorias tardías.', 'Hipersensibilidad local.'],
      exceptional: ['Reacciones alérgicas severas.', 'Infección profunda.', 'Formación de nódulos.', 'Compromiso vascular accidental.', 'Alteraciones de la cicatrización.'],
      riskClosing: 'Entiendo que, aunque estas complicaciones son extremadamente infrecuentes, ningún procedimiento médico está completamente libre de riesgos.',
      care: [
        'Evitar manipular o masajear las áreas tratadas durante las primeras 24 horas, salvo indicación médica.',
        'Evitar maquillaje durante las primeras 12 horas posteriores al procedimiento.',
        'Evitar exposición solar intensa, saunas, turcos y fuentes de calor durante los primeros 5 a 7 días.',
        'Evitar ejercicio físico intenso durante las primeras 24 horas.',
        'Mantener adecuada hidratación.',
        'Utilizar protector solar diariamente.',
        'Asistir a los controles médicos programados.',
        'Informar inmediatamente cualquier síntoma inusual, inflamación excesiva, dolor intenso o cambios en la piel.',
      ],
    }),
  },
  {
    code: 'AES_MESOTERAPIA',
    title: 'Consentimiento informado para mesoterapia facial renovadora (Mesohyal™ X-DNA) (CI-EST-07)',
    bodyHtml: ciEst({
      heading: 'CONSENTIMIENTO INFORMADO PARA APLICACIÓN DE MESOTERAPIA FACIAL RENOVADORA (MESOHYAL™ X-DNA) (CI-EST-07)',
      areas: 'facial (rostro, cuello, escote o manos según valoración médica)',
      description: [
        'El tratamiento consiste en la aplicación intradérmica mediante microinyecciones de Mesohyal™ X-DNA, un producto diseñado para la bioestimulación y revitalización cutánea que contiene ADN altamente purificado, ácido hialurónico y activos regeneradores.',
        'Su objetivo es mejorar la hidratación, elasticidad, luminosidad y calidad de la piel, favoreciendo la reparación celular y ayudando a combatir los signos del envejecimiento cutáneo. Puede aplicarse en rostro, cuello, escote y manos, según valoración médica.',
        'Los resultados son progresivos y pueden variar dependiendo de las características individuales de cada paciente, edad, hábitos de vida, condición de la piel y cumplimiento de las recomendaciones posteriores.',
      ],
      contraindications: [
        'Embarazo o lactancia.',
        'Enfermedades autoinmunes activas o descompensadas.',
        'Infecciones activas en la zona de tratamiento.',
        'Herpes simple activo.',
        'Alergia conocida a cualquiera de los componentes del producto.',
        'Trastornos severos de coagulación.',
        'Uso de anticoagulantes sin autorización médica.',
        'Enfermedades dermatológicas activas en el área a tratar.',
        'Procesos inflamatorios agudos o infecciones sistémicas.',
        'Antecedentes de reacciones alérgicas severas a productos inyectables o a salmón.',
      ],
      riskIntro: 'He sido informado(a) de que este procedimiento puede ocasionar:',
      frequent: ['Enrojecimiento local (eritema).', 'Inflamación leve (edema).', 'Sensibilidad o dolor leve en los sitios de aplicación.', 'Pequeños hematomas o equimosis.', 'Sensación temporal de calor o ardor.', 'Micropápulas transitorias que desaparecen espontáneamente en pocas horas.'],
      uncommon: ['Reacciones inflamatorias prolongadas.', 'Infección local.', 'Hipersensibilidad al producto.', 'Persistencia de hematomas.', 'Alteraciones temporales de la pigmentación.'],
      exceptional: ['Reacciones alérgicas severas.', 'Infecciones profundas.', 'Formación de granulomas.', 'Cicatrización anormal en personas predispuestas.'],
      riskClosing: 'Entiendo que, aunque estas complicaciones son poco frecuentes, ningún procedimiento médico está completamente libre de riesgos.',
      care: [
        'Evitar la exposición solar directa durante las primeras 48 horas.',
        'Aplicar protector solar de amplio espectro de forma estricta.',
        'No utilizar maquillaje durante las primeras 12 horas posteriores al procedimiento.',
        'Evitar saunas, turcos, piscinas y ejercicio intenso durante las primeras 24 a 48 horas.',
        'Mantener adecuada hidratación.',
        'No manipular ni masajear las zonas tratadas salvo indicación médica.',
        'Seguir estrictamente las recomendaciones del profesional tratante.',
      ],
    }),
  },
  {
    code: 'AES_PEELING_MELANOSTOP',
    title: 'Consentimiento informado: peeling despigmentante mesopeel® Melanostop Tranex',
    bodyHtml: `
<section>${header('CONSENTIMIENTO INFORMADO PARA PEELING DESPIGMENTANTE MESOPEEL® MELANOSTOP TRANEX (MESOESTETIC®)', 'facial')}
  <h3>1. Descripción del procedimiento</h3>
  <p>El mesopeel® Melanostop Tranex es un peeling químico despigmentante profesional formulado para acelerar la renovación epidérmica y disminuir la melanina superficial, mejorando las hiperpigmentaciones, el tono irregular y la luminosidad de la piel. Contiene una combinación de ácido azelaico, resorcinol, ácido fítico y ácido tranexámico.</p>
  <p>Se aplica con gasa o pincel en capas con un tiempo de exposición controlado por el profesional, vigilando continuamente la tolerancia; se retira, se aplica crema reparadora y protector solar. Usualmente se indican entre 3 y 5 sesiones con intervalo de 15 días, con mantenimiento según la evolución.</p>
  <h3>2. Indicaciones</h3>
  ${ul(['Melasma epidérmico.', 'Hiperpigmentación postinflamatoria superficial.', 'Léntigos solares.', 'Efélides.', 'Tono de piel irregular.', 'Fotoenvejecimiento.', 'Piel opaca.'])}
  <h3>3. Contraindicaciones</h3>
  <p><strong>Absolutas:</strong></p>
  ${ul(['Embarazo y lactancia.', 'Herpes simple activo.', 'Infecciones cutáneas.', 'Dermatitis activa.', 'Heridas abiertas.', 'Quemaduras solares recientes.', 'Hipersensibilidad a cualquiera de los componentes.', 'Uso reciente de isotretinoína oral (según criterio médico).'])}
  <p><strong>Relativas:</strong></p>
  ${ul(['Piel muy sensible.', 'Enfermedades autoinmunes activas.', 'Uso reciente de retinoides tópicos.', 'Procedimientos ablativos recientes.', 'Fototipo alto con exposición solar no controlada.', 'Mala adherencia a la fotoprotección.'])}
  <h3>4. Beneficios esperados</h3>
  ${ul(['Disminuye las hiperpigmentaciones superficiales.', 'Unifica el tono cutáneo.', 'Mejora la luminosidad.', 'Favorece la renovación epidérmica.', 'Mejora la textura de la piel.', 'Complementa tratamientos despigmentantes domiciliarios.'])}
  <p>${NO_GUARANTEE}</p>
  <h3>5. Posibles complicaciones</h3>
  ${ul(['Eritema.', 'Ardor transitorio.', 'Descamación.', 'Edema leve.', 'Irritación.', 'Hiperpigmentación postinflamatoria.', 'Hipopigmentación (infrecuente).', 'Dermatitis de contacto.', 'Infección secundaria (rara).', 'Quemadura química por técnica inadecuada.'])}
  <h3>6. Cuidados posteriores</h3>
  <p>Me comprometo a:</p>
  ${ul(['Aplicar protector solar FPS 50+ cada 2 a 3 horas.', 'Evitar exposición solar directa durante al menos 7 días.', 'No utilizar exfoliantes ni retinoides durante una semana.', 'No retirar manualmente la piel descamada.', 'Utilizar únicamente los productos formulados por el profesional.', 'Mantener adecuada hidratación cutánea.'])}
${DISCLOSURE}
</section>`.trim(),
  },
  {
    code: 'AES_PEELING_EYECON',
    title: 'Consentimiento informado: peeling periocular Global Eyecon® (mesoestetic®)',
    bodyHtml: `
<section>${header('CONSENTIMIENTO INFORMADO PARA PROCEDIMIENTO DE PEELING PERIOCULAR GLOBAL EYECON® (MESOESTETIC®)', 'facial (contorno de ojos)')}
  <h3>1. Descripción del procedimiento</h3>
  <p>El Peeling Periocular Global Eyecon® (mesoestetic®) es un tratamiento médico-estético profesional diseñado específicamente para el contorno de los ojos. Consiste en la aplicación controlada de un peeling químico que favorece la renovación de la piel, estimula la producción de colágeno y mejora los signos de envejecimiento y fatiga de esta zona.</p>
  <p>Hace parte del protocolo Global Eyecon®, que combina sesiones de peeling periocular y una solución transepidérmica para tratar de forma integral las arrugas finas, líneas de expresión, ojeras, bolsas y flacidez del párpado superior. Los resultados son progresivos y generalmente requieren varias sesiones.</p>
  <h3>2. Beneficios esperados</h3>
  ${ul(['Disminución de líneas finas y arrugas del contorno ocular.', 'Mejoría de las ojeras pigmentarias.', 'Disminución de bolsas leves.', 'Mayor luminosidad de la piel.', 'Mejoría de la textura y firmeza cutánea.', 'Estimulación de la producción de colágeno.', 'Rejuvenecimiento del contorno ocular.'])}
  <p>Comprendo que los resultados pueden variar entre pacientes y dependen de factores individuales como edad, calidad de la piel, hábitos de vida, fotoprotección y cumplimiento del tratamiento indicado. No se garantiza un resultado específico.</p>
  <h3>3. Riesgos y posibles complicaciones</h3>
  ${ul(['Ardor o sensación de calor transitoria.', 'Enrojecimiento (eritema).', 'Descamación leve.', 'Inflamación (edema) temporal.', 'Sensibilidad aumentada.', 'Resequedad cutánea.', 'Irritación local.', 'Hiperpigmentación o hipopigmentación postinflamatoria.', 'Dermatitis de contacto.', 'Infección secundaria (poco frecuente).', 'Quemadura química por reacción individual o aplicación inadecuada (muy poco frecuente).', 'Ausencia de los resultados esperados.'])}
  <h3>4. Contraindicaciones</h3>
  <p>Declaro haber informado de manera completa mis antecedentes médicos y entiendo que este procedimiento no debe realizarse, entre otros casos, cuando exista:</p>
  ${ul(['Embarazo o lactancia.', 'Infecciones activas en el área periocular.', 'Herpes simple activo.', 'Dermatitis, eccema o procesos inflamatorios en la zona.', 'Heridas abiertas.', 'Quemadura solar reciente.', 'Alergia conocida a alguno de los componentes del producto.', 'Cirugía periocular reciente.', 'Uso reciente de isotretinoína sistémica o de medicamentos que, según criterio médico, aumenten el riesgo de complicaciones.', 'Cualquier otra condición que el profesional considere una contraindicación.'])}
  <h3>5. Recomendaciones posteriores</h3>
  ${ul(['No frotar ni manipular el área tratada.', 'No retirar manualmente la piel en caso de descamación.', 'Evitar maquillaje sobre la zona durante las primeras 24 horas o según indicación médica.', 'Aplicar únicamente los productos formulados o recomendados por el profesional.', 'Utilizar protector solar de amplio espectro diariamente.', 'Evitar exposición directa al sol, cámaras de bronceo, saunas y calor intenso durante el período indicado.', 'Informar inmediatamente cualquier reacción intensa o inesperada.'])}
${declarations('Peeling Periocular Global Eyecon® (mesoestetic®)')}
${DISCLOSURE}
</section>`.trim(),
  },
  {
    code: 'AES_EXILIS',
    title: 'Consentimiento informado para procedimiento con Exilis Ultra 360®',
    bodyHtml: `
<section>${header('CONSENTIMIENTO INFORMADO PARA PROCEDIMIENTO CON EXILIS ULTRA 360®', 'facial y/o corporal')}
  <h3>1. Descripción del procedimiento</h3>
  <p>El tratamiento con Exilis Ultra 360® es un procedimiento médico-estético no invasivo que combina simultáneamente radiofrecuencia monopolar y ultrasonido para generar un calentamiento controlado de la piel y del tejido subcutáneo.</p>
  <p>Su finalidad es estimular la producción de colágeno y elastina, mejorar la firmeza de la piel, disminuir la flacidez, mejorar la apariencia de la celulitis y contribuir al remodelamiento corporal y al rejuvenecimiento facial. El procedimiento no requiere cirugía ni tiempo de incapacidad y sus resultados son progresivos.</p>
  <h3>2. Beneficios esperados</h3>
  ${ul(['Mejoría de la flacidez facial y corporal.', 'Estimulación de colágeno y elastina.', 'Rejuvenecimiento cutáneo.', 'Mejoría del contorno corporal.', 'Disminución de la apariencia de la celulitis.', 'Mejoría de la textura y elasticidad de la piel.', 'Procedimiento ambulatorio sin incapacidad.'])}
  <p>Entiendo que los resultados varían entre pacientes y dependen de factores como edad, calidad de la piel, hábitos de vida, alimentación, actividad física y cumplimiento del esquema de tratamiento. No se garantiza un resultado específico.</p>
  <h3>3. Riesgos y posibles complicaciones</h3>
  ${ul(['Enrojecimiento temporal.', 'Sensación de calor.', 'Sensibilidad o dolor leve durante o después del procedimiento.', 'Edema leve.', 'Sequedad cutánea transitoria.', 'Hipersensibilidad.', 'Quemaduras superficiales por circunstancias excepcionales o uso inadecuado del equipo.', 'Alteraciones temporales de la pigmentación.', 'Ampollas (muy poco frecuentes).', 'Ausencia de los resultados esperados.'])}
  <h3>4. Contraindicaciones</h3>
  <p>Declaro haber informado de forma completa mis antecedentes médicos y entiendo que este procedimiento no debe realizarse, entre otros casos, cuando exista:</p>
  ${ul(['Embarazo o lactancia.', 'Marcapasos, desfibriladores o dispositivos electrónicos implantados.', 'Implantes metálicos en la zona de tratamiento.', 'Cáncer activo.', 'Infecciones, heridas o quemaduras en la zona a tratar.', 'Trastornos importantes de la coagulación.', 'Enfermedades cardiovasculares descompensadas.', 'Enfermedades hepáticas o renales graves.', 'Alteraciones importantes de la sensibilidad.', 'Cualquier otra condición que el profesional considere una contraindicación.'])}
  <h3>5. Recomendaciones posteriores</h3>
  ${ul(['Mantener adecuada hidratación.', 'Aplicar protector solar si el tratamiento fue facial.', 'Evitar exposición solar intensa durante 48 horas.', 'Evitar saunas, baños turcos o fuentes intensas de calor durante 24 horas.', 'Mantener alimentación saludable.', 'Asistir a las sesiones y controles programados.', 'Informar inmediatamente cualquier reacción inusual.'])}
${declarations('Exilis Ultra 360®')}
${DISCLOSURE}
</section>`.trim(),
  },
  // Plantillas generales de HabiliSALUD (no provienen de los formatos de la Dra. Quintero).
  {
    code: 'AES_LASER',
    title: 'Consentimiento informado para procedimientos con láser',
    bodyHtml: ciEst({
      heading: 'CONSENTIMIENTO INFORMADO PARA PROCEDIMIENTOS DERMATOLÓGICOS Y ESTÉTICOS CON LÁSER',
      areas: 'las definidas en la valoración médica y registradas en la historia clínica',
      description: [
        'El tratamiento consiste en la aplicación de energía lumínica de un equipo láser sobre la piel, con el fin de actuar sobre estructuras específicas (pigmento, vasos sanguíneos, folículo piloso o tejido cutáneo) según el tipo de láser y la indicación definida por el profesional.',
        'El equipo, los parámetros y el número de sesiones los define el profesional tratante según el fototipo, la zona y la indicación, y quedan registrados en la historia clínica.',
        'Los resultados son progresivos y suelen requerir varias sesiones. ' + NO_GUARANTEE,
      ],
      contraindications: [
        'Embarazo.',
        'Exposición solar intensa o bronceado reciente en la zona a tratar.',
        'Infección, herpes activo o heridas en la zona.',
        'Uso de isotretinoína oral en los últimos 6 meses o de medicamentos fotosensibilizantes, según criterio médico.',
        'Antecedente de epilepsia fotosensible, cuando aplique.',
        'Lesiones pigmentadas sin diagnóstico previo.',
        'Cualquier otra condición que el profesional considere una contraindicación.',
      ],
      riskIntro: 'He sido informado(a) de que el uso de láser puede presentar riesgos y efectos secundarios, que dependen del tipo de equipo, la zona y la respuesta individual.',
      frequent: ['Enrojecimiento.', 'Sensación de calor o ardor.', 'Edema leve.', 'Sensibilidad local.', 'Costras o descamación superficial.'],
      uncommon: ['Hiperpigmentación postinflamatoria.', 'Hipopigmentación.', 'Ampollas.', 'Reactivación de herpes.', 'Respuesta insuficiente al tratamiento.'],
      exceptional: ['Quemaduras.', 'Cicatrices.', 'Infección.', 'Cambios de pigmentación persistentes.', 'Lesión ocular si no se usa la protección indicada.'],
      riskClosing: 'Entiendo que, aunque estas complicaciones son poco frecuentes o excepcionales, ningún procedimiento médico está completamente libre de riesgos.',
      care: [
        'Usar la protección ocular indicada durante el procedimiento.',
        'Aplicar protector solar de amplio espectro y evitar la exposición solar durante el periodo indicado.',
        'No manipular costras ni descamación.',
        'Evitar calor intenso, saunas y ejercicio fuerte durante el periodo indicado.',
        'Utilizar únicamente los productos recomendados por el profesional.',
        'Asistir a los controles y reportar cualquier reacción inusual.',
      ],
    }),
  },
  {
    code: 'AES_MICRONEEDLING',
    title: 'Consentimiento informado para microneedling (inducción percutánea de colágeno)',
    bodyHtml: ciEst({
      heading: 'CONSENTIMIENTO INFORMADO PARA MICRONEEDLING (INDUCCIÓN PERCUTÁNEA DE COLÁGENO)',
      areas: 'las definidas en la valoración médica y registradas en la historia clínica',
      description: [
        'El microneedling consiste en realizar microperforaciones controladas en la piel con un dispositivo de microagujas, con el fin de estimular la producción de colágeno y elastina y mejorar la textura, las cicatrices, los poros y la calidad de la piel.',
        'Durante el procedimiento pueden aplicarse activos tópicos indicados por el profesional. El dispositivo, la profundidad y el número de sesiones los define el profesional tratante y quedan registrados en la historia clínica.',
        'Los resultados son progresivos y suelen requerir varias sesiones. ' + NO_GUARANTEE,
      ],
      contraindications: [
        'Embarazo o lactancia.',
        'Acné inflamatorio activo, infección o herpes activo en la zona.',
        'Trastornos de coagulación o uso de anticoagulantes sin autorización médica.',
        'Tendencia a cicatrices queloides o hipertróficas.',
        'Uso de isotretinoína oral en los últimos 6 meses, según criterio médico.',
        'Enfermedades autoinmunes activas o inmunosupresión.',
        'Alergia conocida a los productos que se aplicarán.',
      ],
      riskIntro: 'He sido informado(a) de que el microneedling puede presentar riesgos y efectos secundarios.',
      frequent: ['Enrojecimiento.', 'Sensibilidad o ardor leve.', 'Edema leve.', 'Pequeños puntos de sangrado.', 'Descamación leve.'],
      uncommon: ['Hematomas.', 'Hiperpigmentación postinflamatoria.', 'Brote de acné o milia.', 'Reactivación de herpes.'],
      exceptional: ['Infección.', 'Cicatrices.', 'Reacción alérgica a los activos aplicados.', 'Granulomas.'],
      riskClosing: 'Entiendo que, aunque estas complicaciones son poco frecuentes o excepcionales, ningún procedimiento médico está completamente libre de riesgos.',
      care: [
        'No aplicar maquillaje durante las primeras 24 horas o según indicación médica.',
        'Aplicar protector solar de amplio espectro y evitar la exposición solar.',
        'Evitar exfoliantes, retinoides y ácidos durante el periodo indicado.',
        'Evitar piscinas, saunas y ejercicio intenso durante las primeras 24 a 48 horas.',
        'No manipular la piel tratada.',
        'Asistir a los controles y reportar cualquier reacción inusual.',
      ],
    }),
  },
  {
    code: 'AES_HILOS',
    title: 'Consentimiento informado para aplicación de hilos tensores',
    bodyHtml: ciEst({
      heading: 'CONSENTIMIENTO INFORMADO PARA APLICACIÓN DE HILOS TENSORES',
      areas: 'las definidas en la valoración médica y registradas en la historia clínica',
      description: [
        'El procedimiento consiste en la inserción en el tejido subcutáneo de hilos reabsorbibles, mediante agujas o cánulas, con el fin de reposicionar tejidos, mejorar la flacidez y estimular la producción de colágeno.',
        'El tipo de hilo, el número de hilos y la técnica los define el profesional tratante según la valoración, y quedan registrados en la historia clínica junto con el producto y el lote utilizados.',
        'Los hilos se reabsorben de forma progresiva y el efecto es temporal. ' + NO_GUARANTEE,
      ],
      contraindications: [
        'Embarazo o lactancia.',
        'Infección activa en la zona a tratar.',
        'Trastornos de coagulación o uso de anticoagulantes sin autorización médica.',
        'Enfermedades autoinmunes activas.',
        'Tendencia a cicatrices queloides.',
        'Alergia conocida al material de los hilos.',
        'Expectativas no realistas sobre el resultado.',
      ],
      riskIntro: 'He sido informado(a) de que la aplicación de hilos tensores puede presentar riesgos y efectos secundarios.',
      frequent: ['Dolor o sensibilidad en la zona.', 'Edema.', 'Hematomas.', 'Sensación de tirantez.', 'Pequeñas irregularidades o depresiones transitorias de la piel.'],
      uncommon: ['Asimetría.', 'Palpación o visibilidad del hilo.', 'Extrusión del hilo.', 'Limitación transitoria de la apertura bucal o de la gesticulación.'],
      exceptional: ['Infección.', 'Granulomas.', 'Lesión de estructuras nerviosas o vasculares.', 'Necesidad de retirar el hilo.'],
      riskClosing: 'Entiendo que, aunque estas complicaciones son poco frecuentes o excepcionales, ningún procedimiento médico está completamente libre de riesgos.',
      care: [
        'Evitar gesticulación exagerada, masajes y presión en la zona durante el periodo indicado.',
        'Dormir boca arriba durante los días indicados.',
        'Evitar ejercicio intenso, saunas y calor intenso durante el periodo indicado.',
        'No realizar tratamientos dentales ni faciales en la zona sin consultar.',
        'Tomar únicamente los medicamentos indicados por el profesional.',
        'Asistir a los controles y reportar dolor intenso, fiebre o enrojecimiento progresivo.',
      ],
    }),
  },
  {
    code: 'AES_USO_IMAGEN',
    title: 'Autorización para el uso de imágenes con fines de divulgación, publicidad o redes sociales',
    bodyHtml: `
<section>
  <h2>AUTORIZACIÓN PARA EL USO DE IMÁGENES CON FINES DE DIVULGACIÓN, PUBLICIDAD O REDES SOCIALES</h2>
  <p><strong>Ciudad y Fecha:</strong> ___________________________</p>
  <p>Yo, ________________________________________________, identificado(a) con C.C. / C.E. / T.I. No. _________________, obrando en nombre propio o como representante legal del paciente ________________________________________________, en relación con las fotografías y videos clínicos tomados durante mi atención por el/la médico(a) _____________________________________, con Registro Profesional No. ______________, declaro:</p>
  <h3>1. Carácter voluntario</h3>
  <p>Esta autorización es independiente del consentimiento para el procedimiento y del registro fotográfico que hace parte de la historia clínica. Negarme a firmarla no afecta mi atención ni las condiciones del tratamiento.</p>
  <h3>2. Usos que autorizo</h3>
  ${ul([
    'Publicaciones en redes sociales y página web del consultorio.',
    'Material informativo o publicitario del consultorio, impreso o digital.',
    'Fines académicos o científicos (congresos, publicaciones, docencia).',
  ])}
  <h3>3. Condiciones de identificación</h3>
  <p>Solo podrán usarse imágenes en las que no se me pueda reconocer: recorte de la zona tratada, ojos cubiertos o sin rostro completo, y sin tatuajes, lunares u otros rasgos que permitan identificarme. Cualquier uso de imágenes en las que se me pueda reconocer requiere una autorización escrita adicional y específica.</p>
  <p>En ningún caso se publicarán mi nombre, documento, datos de contacto ni información clínica distinta a la descripción general del tratamiento.</p>
  <h3>4. Vigencia y revocatoria</h3>
  <p>Puedo revocar esta autorización en cualquier momento, por escrito o por el canal de atención del consultorio. La revocatoria impide nuevos usos y obliga a retirar las publicaciones que estén bajo control del consultorio; entiendo que no es posible retirar copias que terceros hayan hecho de contenidos ya publicados.</p>
  <h3>5. Gratuidad</h3>
  <p>Autorizo el uso de forma gratuita, sin que genere pago o compensación, salvo acuerdo escrito distinto.</p>
  <p><strong>Abajo figura mi firma y certifico que he leído y entendido perfectamente los contenidos de esta autorización.</strong></p>
</section>`.trim(),
  },
];

type ConsentTemplateClient = Pick<PrismaClient, 'consentTemplate'>;

/**
 * Crea las plantillas de estética que falten (versión 1, globales). Nunca
 * reescribe una existente: puede haber consentimientos firmados sobre ese texto;
 * los cambios de redacción deben publicarse como una versión nueva.
 */
export async function seedAestheticConsents(prisma: ConsentTemplateClient) {
  const specialty = ClinicSpecialty.AESTHETIC;
  for (const item of AESTHETIC_CONSENTS) {
    await prisma.consentTemplate.upsert({
      where: { specialty_code_version: { specialty, code: item.code, version: 1 } },
      create: { specialty, code: item.code, title: item.title, bodyHtml: item.bodyHtml, version: 1, isActive: true, clinicId: null },
      update: {},
    });
  }
  return AESTHETIC_CONSENTS.length;
}
