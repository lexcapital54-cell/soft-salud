import { CI_COMMON_CLOSING, ciHeader } from './ci-common.text';

export const CI_ORTHODONTICS_TITLE =
  'Consentimiento informado para ortodoncia y ortopedia maxilar';

export const CI_ORTHODONTICS_HTML = `
<section>
  ${ciHeader('CONSENTIMIENTO INFORMADO PARA ORTODONCIA Y ORTOPEDIA MAXILAR', 'CI-ORT-002')}

  <h3>1. Naturaleza y objetivo del tratamiento</h3>
  <p>La ortodoncia corrige la posición de los dientes y la relación entre ellos; la ortopedia maxilar guía el crecimiento de los maxilares en pacientes en crecimiento. El objetivo es mejorar la función masticatoria, la estabilidad de la mordida, la salud periodontal y la estética facial y dental, de acuerdo con el diagnóstico realizado a partir de la valoración clínica, las fotografías, las radiografías, el análisis cefalométrico y los modelos de estudio.</p>

  <h3>2. Descripción del tratamiento</h3>
  <ul>
    <li><strong>Aparatología fija (brackets):</strong> se adhieren brackets metálicos, de autoligado, estéticos o linguales sobre los dientes y se activan con arcos y elásticos en controles periódicos, aproximadamente cada 4 a 6 semanas.</li>
    <li><strong>Alineadores transparentes:</strong> secuencia de férulas removibles que deben usarse entre 20 y 22 horas al día; pueden requerir aditamentos (attachments), desgaste interproximal, elásticos y alineadores de refinamiento.</li>
    <li><strong>Ortopedia maxilar:</strong> aparatos funcionales, removibles o fijos (por ejemplo, expansores) para modificar el crecimiento óseo; su resultado depende del potencial de crecimiento y del uso.</li>
    <li><strong>Procedimientos auxiliares:</strong> mini implantes de anclaje temporal (DAT / TAD), elásticos intermaxilares, desgaste interproximal, extracciones con fines ortodóncicos o cirugía ortognática combinada, cuando estén indicados.</li>
  </ul>
  <p>La aparatología elegida, los procedimientos auxiliares, la retención planeada, la duración estimada y los dientes con indicación de extracción se señalan en el apartado «Detalle del procedimiento».</p>

  <h3>3. Duración</h3>
  <p>La duración informada es una estimación. Puede extenderse por el crecimiento, la respuesta biológica, la inasistencia a controles, la rotura o pérdida de aparatología, la falta de higiene o el uso insuficiente de elásticos o alineadores. Un tratamiento prolongado no implica fallas del profesional.</p>

  <h3>4. Beneficios esperados</h3>
  <ul>
    <li>Alineación dental y mejor relación entre los maxilares.</li>
    <li>Mejor función masticatoria y distribución de las fuerzas de mordida.</li>
    <li>Mayor facilidad de higiene y mejor pronóstico periodontal.</li>
    <li>Mejora de la estética de la sonrisa y del perfil facial.</li>
  </ul>

  <h3>5. Riesgos específicos</h3>
  <p>Los riesgos que me fueron explicados y acepto, entre ellos la <strong>reabsorción radicular</strong>, las <strong>manchas blancas</strong> por descalcificación, la <strong>recidiva</strong> y el <strong>uso obligatorio de retenedores</strong>, están marcados uno a uno en el apartado «Detalle del procedimiento». En casos de mini implantes pueden presentarse además movilidad o pérdida del tornillo, inflamación local o contacto con raíces; en alineadores, la necesidad de refinamientos o de cambiar a otra aparatología.</p>

  <h3>6. Retención</h3>
  <p>Al terminar la fase activa se instalan retenedores fijos y/o removibles. <strong>La retención es parte obligatoria del tratamiento y se recomienda de por vida</strong>: los dientes pueden moverse durante toda la vida por el crecimiento, el envejecimiento y los hábitos. La pérdida, la rotura o el uso inadecuado de los retenedores puede generar recidiva, cuya corrección constituye un nuevo tratamiento.</p>

  <h3>7. Alternativas</h3>
  <p>Según el caso: no realizar tratamiento, tratamiento interceptivo o limitado, otro tipo de aparatología (fija, alineadores o removible), tratamiento compensatorio sin cirugía o tratamiento combinado con cirugía ortognática, y opciones restauradoras o protésicas que disimulen la malposición. El profesional me explicó las alternativas aplicables con sus ventajas, limitaciones y costos.</p>

  <h3>8. Consecuencias de no tratarme</h3>
  <p>Persistencia o empeoramiento de la maloclusión, desgaste dental irregular, mayor dificultad de higiene con riesgo de caries y enfermedad periodontal, posibles alteraciones de la articulación temporomandibular y, en pacientes en crecimiento, pérdida de la oportunidad de corrección ortopédica.</p>

  ${CI_COMMON_CLOSING}
</section>
`.trim();
