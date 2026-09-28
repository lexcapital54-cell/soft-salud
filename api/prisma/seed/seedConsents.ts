import { ClinicSpecialty, PrismaClient } from '@prisma/client';

type ConsentSeed = {
  code: string;
  title: string;
  bodyHtml: string;
  bodyMarkdown?: string;
};

/**
 * Plantillas legales Psicología v1.
 * HABEAS_DATA / PSI_ADULT / PSI_NNA: contenido de los .doc en la raíz del monorepo
 * (también copiados en catalogs/consents/).
 * TELEPSYCHOLOGY: plantilla base complementaria (editable).
 */
const PSYCHOLOGY_CONSENTS_V1: ConsentSeed[] = [
  {
    code: 'HABEAS_DATA',
    title:
      'Autorización para el tratamiento de datos personales y sensibles (Ley 1581 de 2012)',
    bodyHtml: `
<section>
  <h2>AUTORIZACIÓN PARA EL TRATAMIENTO DE DATOS PERSONALES Y SENSIBLES (LEY 1581 DE 2012)</h2>
  <p><strong>Ciudad y Fecha:</strong> ___________________________</p>

  <p>Yo, ________________________________________________, identificado(a) con C.C. / C.E. / T.I. No. _________________ de _________________, obrando en nombre propio o en representación legal del menor/paciente ________________________________________________, autorizo de manera previa, expresa e informada al consultorio/profesional tratante para realizar la recolección, almacenamiento, uso, circulación y supresión de mis datos personales y <strong>datos sensibles</strong>, conforme a lo dispuesto en la Ley 1581 de 2012 y el Decreto 1377 de 2013.</p>

  <h3>1. Finalidad del Tratamiento</h3>
  <p>Entiendo y acepto que mis datos personales y sensibles (relacionados con mi estado de salud física y mental, antecedentes clínicos, diagnósticos, y procesos terapéuticos) serán utilizados estrictamente para las siguientes finalidades:</p>
  <ul>
    <li>Prestación integral de servicios de salud (evaluación, diagnóstico y tratamiento).</li>
    <li>Apertura, actualización y custodia de la Historia Clínica Electrónica, en estricto cumplimiento de la Resolución 1995 de 1999 y la Resolución 1732 de 2026 del Ministerio de Salud y Protección Social.</li>
    <li>Gestión administrativa: agendamiento de citas, recordatorios vía plataformas de mensajería (WhatsApp/Email/SMS), facturación electrónica y reporte de RIPS al Ministerio.</li>
  </ul>

  <h3>2. Tratamiento de Datos Sensibles</h3>
  <p>Se me ha informado que, por tratarse de datos relativos a mi salud (considerados legalmente como <em>datos sensibles</em>), <strong>no estoy obligado(a) a autorizar su tratamiento</strong> para fines distintos a los de la prestación del servicio. Sin embargo, entiendo que la recolección de los datos clínicos y demográficos es un requisito legal, asistencial e ineludible para que el profesional pueda brindarme la atención en salud solicitada y registrarla en el sistema de salud colombiano.</p>

  <h3>3. Derechos del Titular</h3>
  <p>Conozco que, como titular de los datos personales, me asisten los derechos previstos en la ley, específicamente los de: a) Conocer, actualizar y rectificar mis datos personales; b) Solicitar prueba de esta autorización; c) Ser informado sobre el uso que se le ha dado a mis datos; d) Presentar quejas ante la Superintendencia de Industria y Comercio por infracciones; e) Revocar la autorización y/o solicitar la supresión del dato (<strong>Nota Legal:</strong> La supresión de la historia clínica no será procedente cuando exista un deber legal de permanecer en la base de datos, como lo es la obligación de custodia clínica por un periodo mínimo de 15 años, según la normatividad vigente).</p>

  <p>Leído el presente documento, manifiesto que he sido informado de forma clara y precisa, y otorgo mi consentimiento libre, consciente y voluntario.</p>
</section>
`.trim(),
  },
  {
    code: 'PSI_ADULT',
    title:
      'Consentimiento informado para evaluación y tratamiento psicológico (adultos)',
    bodyHtml: `
<section>
  <h2>CONSENTIMIENTO INFORMADO PARA EVALUACIÓN Y TRATAMIENTO PSICOLÓGICO (ADULTOS)</h2>
  <p><strong>Ciudad y Fecha:</strong> ___________________________</p>

  <p>Yo, ________________________________________________, identificado(a) con C.C. / C.E. No. _________________ de _________________, obrando en nombre propio y en pleno uso de mis facultades mentales, declaro que he sido informado(a) de manera clara y comprensible por el/la psicólogo(a) _____________________________________, con Tarjeta Profesional No. ______________, sobre los siguientes aspectos del proceso psicológico:</p>

  <ol>
    <li><strong>Naturaleza de la Intervención:</strong> Comprendo que el objetivo es realizar una evaluación y/o intervención psicológica. Entiendo que los resultados dependen en gran medida de mi compromiso y participación activa.</li>
    <li><strong>Confidencialidad y Secreto Profesional (Ley 1090 de 2006):</strong> Todo lo que se discuta en las sesiones se mantendrá en estricta confidencialidad. Sin embargo, entiendo que el profesional está obligado a romper el secreto profesional si: a) Existe un riesgo inminente contra mi vida o integridad física; b) Existe un riesgo inminente contra la vida o integridad de terceros; c) Se sospecha de abuso o vulneración de derechos de menores o población vulnerable; d) Existe una orden de autoridad judicial competente.</li>
    <li><strong>Tratamiento de Datos Personales (Ley 1581 de 2012):</strong> Autorizo el tratamiento de mis datos personales y sensibles (datos de salud y emocionales) exclusivamente para fines vinculados a la prestación del servicio de salud, apertura de la historia clínica y facturación, garantizando que estos serán custodiados bajo las medidas de seguridad vigentes (Res. 1995 de 1999 y Res. 1732 de 2026).</li>
    <li><strong>Riesgos y Beneficios:</strong> Entiendo que el proceso psicológico puede traer a la superficie emociones o recuerdos difíciles, lo cual es parte del proceso terapéutico. A su vez, los beneficios esperados incluyen el desarrollo de herramientas de afrontamiento y mejoramiento de mi bienestar emocional.</li>
    <li><strong>Libertad de Participación:</strong> Entiendo que mi participación es completamente voluntaria y tengo el derecho de suspender o abandonar el tratamiento en el momento que lo considere pertinente, sin penalidad alguna, asumiendo la responsabilidad sobre dicha decisión.</li>
  </ol>

  <p>Habiendo leído y comprendido lo anterior, y habiendo resuelto todas mis dudas con el profesional, autorizo el inicio del proceso de evaluación y/o tratamiento psicológico.</p>
</section>
`.trim(),
  },
  {
    code: 'PSI_NNA',
    title:
      'Consentimiento informado para evaluación y tratamiento psicológico de NNA',
    bodyHtml: `
<section>
  <h2>CONSENTIMIENTO INFORMADO PARA EVALUACIÓN Y TRATAMIENTO PSICOLÓGICO DE NIÑOS, NIÑAS Y ADOLESCENTES (NNA)</h2>
  <p><strong>Ciudad y Fecha:</strong> ___________________________</p>

  <p>Nosotros (o Yo), ________________________________________________, identificado(a) con C.C. No. _________________, y ________________________________________________, identificado(a) con C.C. No. _________________, obrando en calidad de padres y/o representantes legales del(la) menor ________________________________________________, de ______ años de edad, identificado(a) con documento No. _________________, declaramos que el/la psicólogo(a) _____________________________________, con Tarjeta Profesional No. ______________, nos ha informado sobre el proceso psicológico a seguir:</p>

  <ol>
    <li><strong>Naturaleza de la Intervención:</strong> Entendemos que el objetivo es realizar una evaluación y/o intervención psicológica a nuestro(a) hijo(a)/representado(a). Nos comprometemos a asistir a las citaciones del profesional, participar activamente y facilitar el proceso clínico.</li>
    <li><strong>Confidencialidad y Secreto Profesional (Ley 1090 de 2006):</strong> Entendemos que para fomentar un espacio terapéutico seguro y de confianza, la información que el/la menor comparta en las sesiones es <strong>confidencial</strong>. El/la psicólogo(a) nos brindará retroalimentación general sobre el estado emocional y lineamientos de crianza, pero <em>no revelará detalles literales o específicos</em> de lo conversado, a menos que exista un riesgo inminente para su vida, su integridad (abuso, maltrato) o la de terceros.</li>
    <li><strong>Tratamiento de Datos Personales (Ley 1581 de 2012):</strong> Autorizamos expresamente el tratamiento de los datos personales y sensibles (historia clínica) de nuestro(a) representado(a), de manera segura y exclusiva para los fines del proceso clínico, terapéutico y administrativo.</li>
    <li><strong>Asentimiento del Menor:</strong> Entendemos que el proceso requiere la participación voluntaria del/la menor (asentimiento). Si el/la menor manifiesta una negativa persistente y rotunda a participar, la intervención no podrá ser forzada y el profesional discutirá las alternativas con nosotros.</li>
  </ol>

  <p>Habiendo leído y comprendido lo anterior, y tras resolver nuestras inquietudes, autorizamos el inicio del proceso psicológico.</p>

  <h3>ASENTIMIENTO DEL MENOR (Para ser diligenciado con el menor si tiene capacidad de comprensión)</h3>
  <p>El/la psicólogo(a) me ha explicado de qué se tratan las sesiones. Entiendo que vengo a este espacio para hablar, dibujar, jugar o hacer actividades que me ayuden a sentirme mejor. Sé que lo que yo diga es privado y secreto, pero si me encuentro en peligro o alguien me hace daño, el/la psicólogo(a) hablará con los adultos encargados para cuidarme y protegerme. Acepto participar en las sesiones.</p>
</section>
`.trim(),
  },
  {
    code: 'TELEPSYCHOLOGY',
    title: 'Consentimiento para telepsicología / modalidad virtual',
    bodyHtml: `
<section>
  <h1>Consentimiento informado — telepsicología (modalidad virtual)</h1>
  <p>El/la paciente (o su representante legal) autoriza la prestación de servicios de psicología mediante medios tecnológicos de información y comunicación, complementarios o alternativos a la atención presencial, bajo estándares de calidad, ética (<strong>Ley 1090 de 2006</strong>) y protección de datos (<strong>Ley 1581 de 2012</strong>).</p>

  <h2>1. Objeto y modalidad</h2>
  <p>Recibir atención psicológica a distancia (videollamada u otro canal autorizado por la IPS), con registro en historia clínica y las mismas obligaciones de confidencialidad aplicables a la atención presencial, en lo pertinente.</p>

  <h2>2. Condiciones técnicas y de entorno</h2>
  <ul>
    <li>Disponer de dispositivo, conexión a internet y espacio privado razonable durante la sesión.</li>
    <li>No grabar la sesión sin autorización expresa y escrita de las partes, salvo obligación legal.</li>
    <li>Verificar identidad al inicio de cada encuentro remoto.</li>
  </ul>

  <h2>3. Beneficios y limitaciones</h2>
  <p>La telepsicología facilita el acceso y la continuidad. Presenta limitaciones frente a emergencias, evaluación de signos físicos y fallas tecnológicas. En crisis o riesgo, se priorizarán rutas de urgencia locales y/o presencialidad.</p>

  <h2>4. Seguridad de la información</h2>
  <p>Se utilizarán canales y prácticas razonables de seguridad. El usuario también se compromete a no compartir enlaces de sesión ni credenciales y a cerrar la sesión en dispositivos compartidos.</p>

  <h2>5. Consentimiento y revocación</h2>
  <p>Este consentimiento puede revocarse en cualquier momento. La revocación no afecta la atención ya prestada ni las obligaciones legales de conservación documental.</p>

  <h2>6. Declaración</h2>
  <p>Declaro haber sido informado(a) sobre la modalidad virtual, sus alcances y riesgos, y autorizo la telepsicología en los términos aquí descritos.</p>
</section>
`.trim(),
  },
  {
    code: 'DISSENT_HOSPITALIZATION',
    title:
      'Disentimiento de hospitalización / remisión a urgencias (rechazo informado)',
    bodyHtml: `
<section>
  <h2>DISENTIMIENTO DE HOSPITALIZACIÓN Y/O REMISIÓN A URGENCIAS</h2>
  <p><strong>Ciudad y Fecha:</strong> ___________________________</p>

  <p>Yo, ________________________________________________, identificado(a) con documento No. _________________, obrando en nombre propio o en representación legal del(la) paciente ________________________________________________, declaro que el/la profesional _____________________________________, TP ______________, me ha informado de manera clara sobre:</p>
  <ol>
    <li>La recomendación clínica de hospitalización y/o remisión a un servicio de urgencias.</li>
    <li>Los riesgos razonablemente previsibles de no seguir dicha recomendación (incluyendo posible deterioro, crisis o daño a sí mismo/a o a terceros).</li>
    <li>Las alternativas disponibles y las limitaciones del manejo ambulatorio en este momento.</li>
  </ol>

  <p><strong>Declaración de disentimiento:</strong> Habiendo comprendido la información, <strong>rechazo de manera libre, consciente e informada</strong> la hospitalización y/o remisión sugerida, asumiendo la responsabilidad por las consecuencias de esta decisión. Entiendo que puedo reconsiderarla en cualquier momento y solicitar nuevamente valoración.</p>

  <p>Se me ha indicado la ruta de atención en caso de emergencia (líneas de urgencias / 123 / servicio de salud más cercano) y que el profesional documentará este disentimiento en la historia clínica conforme a la Ley 1090 de 2006 y la Resolución 1995 de 1999.</p>

  <p>En constancia firman paciente o acudiente y el/la profesional tratante.</p>
</section>
`.trim(),
  },
];

const PHYSIOTHERAPY_CONSENTS_V1: ConsentSeed[] = [
  {
    code: 'HABEAS_DATA',
    title:
      'Autorización para el tratamiento de datos personales y sensibles (Ley 1581 de 2012)',
    bodyHtml: `
<section>
  <h2>AUTORIZACIÓN PARA EL TRATAMIENTO DE DATOS PERSONALES Y SENSIBLES (LEY 1581 DE 2012)</h2>
  <p><strong>Ciudad y Fecha:</strong> ___________________________</p>

  <p>Yo, ________________________________________________, identificado(a) con C.C. / C.E. / T.I. No. _________________ de _________________, obrando en nombre propio o en representación legal del menor/paciente ________________________________________________, autorizo de manera previa, expresa e informada al consultorio de fisioterapia / profesional tratante para realizar la recolección, almacenamiento, uso, circulación y supresión de mis datos personales y <strong>datos sensibles</strong>, conforme a lo dispuesto en la Ley 1581 de 2012 y el Decreto 1377 de 2013.</p>

  <h3>1. Finalidad del Tratamiento</h3>
  <p>Entiendo y acepto que mis datos personales y sensibles (relacionados con mi estado de salud física, funcionalidad, antecedentes clínicos, diagnósticos e intervenciones fisioterapéuticas) serán utilizados estrictamente para:</p>
  <ul>
    <li>Prestación integral de servicios de fisioterapia (evaluación, diagnóstico fisioterapéutico y tratamiento).</li>
    <li>Apertura, actualización y custodia de la Historia Clínica, en cumplimiento de la Resolución 1995 de 1999 y demás normas aplicables.</li>
    <li>Gestión administrativa: agendamiento, recordatorios, facturación y reportes al sistema de salud cuando aplique.</li>
  </ul>

  <h3>2. Tratamiento de Datos Sensibles</h3>
  <p>Se me ha informado que, por tratarse de datos relativos a mi salud (datos sensibles), <strong>no estoy obligado(a) a autorizar su tratamiento</strong> para fines distintos a la prestación del servicio. La recolección de datos clínicos es requisito para brindarme la atención solicitada.</p>

  <h3>3. Derechos del Titular</h3>
  <p>Conozco mis derechos de conocer, actualizar y rectificar datos; solicitar prueba de esta autorización; ser informado del uso; presentar quejas ante la SIC; y revocar la autorización cuando la ley lo permita, sin perjuicio de la custodia legal de la historia clínica.</p>

  <p>Leído el presente documento, otorgo mi consentimiento libre, consciente y voluntario.</p>
</section>
`.trim(),
  },
  {
    code: 'FT_INFORMED',
    title: 'Consentimiento informado para evaluación y tratamiento fisioterapéutico',
    bodyHtml: `
<section>
  <h2>CONSENTIMIENTO INFORMADO PARA EVALUACIÓN Y TRATAMIENTO FISIOTERAPÉUTICO</h2>
  <p><strong>Ciudad y Fecha:</strong> ___________________________</p>

  <p>Yo, ________________________________________________, identificado(a) con documento No. _________________, obrando en nombre propio o como representante legal del paciente ________________________________________________, declaro que he sido informado(a) de manera clara por el/la fisioterapeuta _____________________________________, con Tarjeta Profesional No. ______________, sobre:</p>

  <ol>
    <li><strong>Naturaleza de la intervención:</strong> evaluación fisioterapéutica, diagnóstico fisioterapéutico y plan de intervención (ejercicio terapéutico, modalidades físicas, educación, etc.) según criterio profesional.</li>
    <li><strong>Beneficios esperados:</strong> mejorar función, aliviar dolor, recuperar movilidad/fuerza/equilibrio o prevenir complicaciones, según el caso clínico.</li>
    <li><strong>Riesgos y molestias:</strong> dolor muscular transitorio, fatiga, irritación cutánea por modalidades, o agravamiento temporal de síntomas. Se me indicó reportar inmediatamente cualquier malestar intenso.</li>
    <li><strong>Alternativas:</strong> otras opciones de rehabilitación, remisión a otro profesional o no intervenir, con las consecuencias clínicas que ello implica.</li>
    <li><strong>Confidencialidad y datos:</strong> la información clínica se custodia conforme a la Ley 1581 de 2012 y la normativa de historia clínica.</li>
    <li><strong>Participación voluntaria:</strong> puedo suspender o rechazar procedimientos en cualquier momento, informando al profesional.</li>
  </ol>

  <p>Habiendo resuelto mis dudas, autorizo el inicio de la evaluación y/o tratamiento fisioterapéutico propuesto.</p>
</section>
`.trim(),
  },
  {
    code: 'FT_TELEHEALTH',
    title: 'Consentimiento para atención virtual de fisioterapia',
    bodyHtml: `
<section>
  <h2>Consentimiento informado — fisioterapia en modalidad virtual</h2>
  <p>El/la paciente (o representante legal) autoriza la prestación de servicios de fisioterapia mediante medios tecnológicos, complementarios o alternativos a la atención presencial, con registro en historia clínica y protección de datos (Ley 1581 de 2012).</p>
  <ul>
    <li>Disponer de espacio seguro y dispositivo adecuado durante la sesión.</li>
    <li>Entender limitaciones de la valoración remota frente a la presencial.</li>
    <li>En dolor agudo intenso, mareo, caída o emergencia, priorizar atención presencial/urgencia.</li>
  </ul>
  <p>Este consentimiento puede revocarse en cualquier momento sin afectar la atención ya prestada ni las obligaciones de conservación documental.</p>
</section>
`.trim(),
  },
];

const DENTISTRY_CONSENTS_V1: ConsentSeed[] = [
  {
    code: 'HABEAS_DATA',
    title:
      'Autorización para el tratamiento de datos personales y sensibles (Ley 1581 de 2012)',
    bodyHtml: `
<section>
  <h2>AUTORIZACIÓN PARA EL TRATAMIENTO DE DATOS PERSONALES Y SENSIBLES (LEY 1581 DE 2012)</h2>
  <p><strong>Ciudad y Fecha:</strong> ___________________________</p>

  <p>Yo, ________________________________________________, identificado(a) con C.C. / C.E. / T.I. No. _________________ de _________________, obrando en nombre propio o en representación legal del menor/paciente ________________________________________________, autorizo de manera previa, expresa e informada al consultorio odontológico / profesional tratante para realizar la recolección, almacenamiento, uso, circulación y supresión de mis datos personales y <strong>datos sensibles</strong>, conforme a lo dispuesto en la Ley 1581 de 2012 y el Decreto 1377 de 2013.</p>

  <h3>1. Finalidad del Tratamiento</h3>
  <p>Entiendo y acepto que mis datos personales y sensibles (estado de salud general y bucal, antecedentes, odontograma, radiografías, fotografías clínicas, diagnósticos y tratamientos) serán utilizados estrictamente para:</p>
  <ul>
    <li>Prestación integral de servicios de odontología y/u ortodoncia (valoración, diagnóstico y tratamiento).</li>
    <li>Apertura, actualización y custodia de la Historia Clínica Odontológica, en cumplimiento de la Resolución 1995 de 1999 y demás normas aplicables.</li>
    <li>Gestión administrativa: agendamiento, recordatorios, facturación y reportes al sistema de salud (RIPS / RDA) cuando aplique.</li>
  </ul>

  <h3>2. Tratamiento de Datos Sensibles</h3>
  <p>Se me ha informado que, por tratarse de datos relativos a mi salud (datos sensibles), <strong>no estoy obligado(a) a autorizar su tratamiento</strong> para fines distintos a la prestación del servicio. La recolección de datos clínicos es requisito para brindarme la atención solicitada.</p>

  <h3>3. Derechos del Titular</h3>
  <p>Conozco mis derechos de conocer, actualizar y rectificar datos; solicitar prueba de esta autorización; ser informado del uso; presentar quejas ante la SIC; y revocar la autorización cuando la ley lo permita, sin perjuicio de la custodia legal de la historia clínica.</p>

  <p>Leído el presente documento, otorgo mi consentimiento libre, consciente y voluntario.</p>
</section>
`.trim(),
  },
  {
    code: 'ODO_INFORMED',
    title: 'Consentimiento informado para valoración y tratamiento odontológico',
    bodyHtml: `
<section>
  <h2>CONSENTIMIENTO INFORMADO PARA VALORACIÓN Y TRATAMIENTO ODONTOLÓGICO</h2>
  <p><strong>Ciudad y Fecha:</strong> ___________________________</p>

  <p>Yo, ________________________________________________, identificado(a) con documento No. _________________, obrando en nombre propio o como representante legal del paciente ________________________________________________, declaro que he sido informado(a) de manera clara por el/la odontólogo(a) _____________________________________, con Registro Profesional No. ______________, sobre:</p>

  <ol>
    <li><strong>Naturaleza de la intervención:</strong> examen clínico, odontograma, toma de radiografías cuando se requieran y el plan de tratamiento propuesto (operatoria, endodoncia, periodoncia, cirugía oral, prótesis u otros).</li>
    <li><strong>Beneficios esperados:</strong> restablecer la salud bucal, aliviar dolor, recuperar función masticatoria y estética, y prevenir complicaciones.</li>
    <li><strong>Riesgos y molestias:</strong> sensibilidad dental, dolor o inflamación postoperatoria, sangrado, reacciones a la anestesia local, parestesia transitoria, fractura de restauraciones o necesidad de tratamientos adicionales.</li>
    <li><strong>Alternativas:</strong> otras opciones terapéuticas, remisión a especialista o no realizar el tratamiento, con las consecuencias clínicas que ello implica.</li>
    <li><strong>Compromisos del paciente:</strong> seguir las indicaciones de higiene y cuidado, asistir a los controles e informar cambios en mi estado de salud o medicamentos.</li>
    <li><strong>Participación voluntaria:</strong> puedo suspender o rechazar procedimientos en cualquier momento, informando al profesional.</li>
  </ol>

  <p>Habiendo resuelto mis dudas, autorizo la valoración y/o el tratamiento odontológico propuesto.</p>
</section>
`.trim(),
  },
  {
    code: 'ODO_ORTHODONTICS',
    title: 'Consentimiento informado para tratamiento de ortodoncia',
    bodyHtml: `
<section>
  <h2>CONSENTIMIENTO INFORMADO PARA TRATAMIENTO DE ORTODONCIA</h2>
  <p><strong>Ciudad y Fecha:</strong> ___________________________</p>

  <p>Yo, ________________________________________________, identificado(a) con documento No. _________________, obrando en nombre propio o como representante legal del paciente ________________________________________________, declaro que se me ha explicado:</p>

  <ol>
    <li><strong>Objetivo:</strong> corregir la posición dental y/o la relación de los maxilares mediante aparatología fija o removible, según el diagnóstico ortodóncico.</li>
    <li><strong>Duración:</strong> el tiempo estimado es orientativo y depende del crecimiento, la colaboración del paciente y la asistencia a controles.</li>
    <li><strong>Riesgos:</strong> descalcificación o caries por higiene deficiente, reabsorción radicular, molestias en la ATM, recidiva si no se usan los retenedores, lesiones en mucosa por la aparatología.</li>
    <li><strong>Compromisos:</strong> higiene rigurosa, asistencia a controles, cuidado de la aparatología y uso de retenedores al finalizar.</li>
    <li><strong>Alternativas:</strong> no tratar, tratamiento interceptivo o combinado con cirugía ortognática, según el caso.</li>
  </ol>

  <p>Habiendo resuelto mis dudas, autorizo el inicio del tratamiento de ortodoncia propuesto.</p>
</section>
`.trim(),
  },
];

const CONSENTS_BY_SPECIALTY: Array<[ClinicSpecialty, ConsentSeed[]]> = [
  [ClinicSpecialty.PSYCHOLOGY, PSYCHOLOGY_CONSENTS_V1],
  [ClinicSpecialty.PHYSIOTHERAPY, PHYSIOTHERAPY_CONSENTS_V1],
  [ClinicSpecialty.DENTISTRY, DENTISTRY_CONSENTS_V1],
];

export async function seedConsents(prisma: PrismaClient) {
  let upserted = 0;

  for (const [specialty, items] of CONSENTS_BY_SPECIALTY) {
    for (const item of items) {
      await prisma.consentTemplate.upsert({
        where: {
          specialty_code_version: { specialty, code: item.code, version: 1 },
        },
        create: {
          specialty,
          code: item.code,
          title: item.title,
          bodyHtml: item.bodyHtml,
          bodyMarkdown: item.bodyMarkdown ?? null,
          version: 1,
          isActive: true,
          clinicId: null,
        },
        update: {
          title: item.title,
          bodyHtml: item.bodyHtml,
          bodyMarkdown: item.bodyMarkdown ?? null,
          isActive: true,
        },
      });
      upserted += 1;
    }
  }

  return { templates: upserted, version: 1 };
}
