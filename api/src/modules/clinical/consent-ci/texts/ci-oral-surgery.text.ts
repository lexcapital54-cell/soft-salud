import { CI_COMMON_CLOSING, ciHeader } from './ci-common.text';

export const CI_ORAL_SURGERY_TITLE =
  'Consentimiento informado para cirugía oral y extracciones dentales';

export const CI_ORAL_SURGERY_HTML = `
<section>
  ${ciHeader('CONSENTIMIENTO INFORMADO PARA CIRUGÍA ORAL Y EXTRACCIONES DENTALES', 'CI-CIR-003')}

  <h3>1. Naturaleza y objetivo del procedimiento</h3>
  <p>La cirugía oral comprende la extracción de dientes erupcionados, incluidos o semi-incluidos, y otros procedimientos sobre los tejidos de la boca (frenectomías, biopsias, regularización ósea, drenaje de abscesos). Su objetivo es eliminar focos de infección o dolor, resolver lesiones, facilitar otros tratamientos (ortodoncia, prótesis, implantes) o prevenir complicaciones futuras.</p>

  <h3>2. Descripción del procedimiento</h3>
  <ul>
    <li><strong>Exodoncia simple:</strong> luxación y extracción del diente con elevadores y fórceps, bajo anestesia local.</li>
    <li><strong>Exodoncia quirúrgica:</strong> puede requerir incisión y levantamiento de la encía (colgajo), remoción de hueso (osteotomía), división del diente (odontosección) y sutura.</li>
    <li><strong>Dientes incluidos:</strong> terceros molares o caninos retenidos se extraen o se exponen para traccionarlos con ortodoncia.</li>
    <li><strong>Otros procedimientos:</strong> frenectomía, biopsia con estudio histopatológico, regularización del reborde óseo y drenaje de colecciones infecciosas.</li>
  </ul>
  <p>Los dientes a extraer, el procedimiento, su indicación y el tipo de anestesia se señalan en el apartado «Detalle del procedimiento». Durante la cirugía pueden presentarse hallazgos que obliguen a modificar la técnica prevista; autorizo al profesional a realizar las acciones necesarias para resolverlos de forma segura, informándome después.</p>

  <h3>3. Anestesia y medicación</h3>
  <p>El procedimiento se realiza habitualmente con anestesia local. La sedación o la anestesia general solo se realizan en servicios habilitados para ello y requieren valoración y consentimiento adicionales. Puede formularse analgésico, antiinflamatorio y, cuando esté indicado, antibiótico. He informado si tomo anticoagulantes, antiagregantes, bifosfonatos u otros medicamentos, así como alergias, embarazo y enfermedades como diabetes, hipertensión o alteraciones de la coagulación.</p>

  <h3>4. Beneficios esperados</h3>
  <ul>
    <li>Eliminación del dolor, la infección o la lesión que motiva la cirugía.</li>
    <li>Prevención de complicaciones como quistes, daño a dientes vecinos o infecciones recurrentes.</li>
    <li>Creación de condiciones favorables para la ortodoncia, la prótesis o los implantes.</li>
  </ul>

  <h3>5. Riesgos específicos</h3>
  <p>Los riesgos que me fueron explicados y acepto, entre ellos la <strong>lesión del nervio dentario inferior o lingual</strong> con adormecimiento del labio, el mentón o la lengua, la <strong>comunicación oroantral</strong>, la alveolitis, el sangrado y la fractura radicular, están marcados uno a uno en el apartado «Detalle del procedimiento». Entiendo que algunas complicaciones pueden requerir tratamientos adicionales, medicación, controles extra o remisión a cirugía maxilofacial.</p>

  <h3>6. Cuidados postoperatorios</h3>
  <ul>
    <li>Morder la gasa 30 a 60 minutos; no escupir, no enjuagarse con fuerza ni usar pitillo durante 24 horas.</li>
    <li>Aplicar frío local las primeras 24 a 48 horas y mantener reposo relativo.</li>
    <li>Dieta blanda y fría, evitar alcohol y cigarrillo, que aumentan el riesgo de alveolitis.</li>
    <li>Tomar la medicación formulada y asistir al control y retiro de puntos.</li>
  </ul>

  <h3>7. Alternativas</h3>
  <p>Según el caso: conservar el diente con endodoncia, restauración o tratamiento periodontal; observación y control radiográfico periódico (especialmente en terceros molares asintomáticos); tratamiento farmacológico temporal de la infección; o remisión a cirugía maxilofacial. El profesional me explicó las alternativas aplicables y por qué recomienda el procedimiento.</p>

  <h3>8. Consecuencias de no tratarme</h3>
  <p>Persistencia o recurrencia del dolor y la infección, que puede extenderse a los espacios faciales; formación de quistes; daño a dientes vecinos; reabsorción ósea; e imposibilidad de realizar tratamientos de ortodoncia, prótesis o implantes previstos.</p>

  ${CI_COMMON_CLOSING}
</section>
`.trim();
