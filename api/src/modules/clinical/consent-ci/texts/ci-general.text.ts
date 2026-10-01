import { CI_COMMON_CLOSING, ciHeader } from './ci-common.text';

export const CI_GENERAL_TITLE =
  'Consentimiento informado para odontología general y diagnóstico';

export const CI_GENERAL_HTML = `
<section>
  ${ciHeader('CONSENTIMIENTO INFORMADO PARA ODONTOLOGÍA GENERAL Y DIAGNÓSTICO', 'CI-OD-001')}

  <h3>1. Naturaleza y objetivo de la atención</h3>
  <p>La atención odontológica general tiene como objetivo valorar el estado de salud bucal, establecer un diagnóstico y ejecutar un plan de tratamiento para prevenir, controlar o tratar enfermedades de los dientes, las encías y los tejidos de soporte, y recuperar la función masticatoria, la fonación y la estética.</p>

  <h3>2. Descripción de los procedimientos</h3>
  <ul>
    <li><strong>Valoración y diagnóstico:</strong> entrevista clínica, revisión de antecedentes, examen extraoral e intraoral, odontograma, índices de placa y, cuando se requieran, fotografías y modelos de estudio.</li>
    <li><strong>Ayudas diagnósticas:</strong> radiografías intraorales o panorámicas, con la protección radiológica correspondiente.</li>
    <li><strong>Prevención:</strong> profilaxis, detartraje supragingival, aplicación de flúor y sellantes de fosas y fisuras.</li>
    <li><strong>Operatoria:</strong> remoción de caries y restauración del diente con resinas, ionómeros u otros materiales.</li>
    <li><strong>Endodoncia:</strong> tratamiento de los conductos radiculares cuando la pulpa está inflamada, infectada o necrótica.</li>
    <li><strong>Periodoncia básica:</strong> raspaje y alisado radicular para controlar la enfermedad de las encías.</li>
    <li><strong>Rehabilitación:</strong> prótesis fijas o removibles para reemplazar dientes ausentes o muy destruidos.</li>
  </ul>
  <p>Los procedimientos efectivamente autorizados, los dientes a intervenir y el tipo de anestesia se señalan en el apartado «Detalle del procedimiento».</p>

  <h3>3. Anestesia local</h3>
  <p>Algunos procedimientos requieren anestesia local por infiltración o bloqueo troncular, con o sin vasoconstrictor. He informado mis antecedentes de hipertensión, cardiopatías, diabetes, alergias, embarazo, lactancia y reacciones previas a anestésicos.</p>

  <h3>4. Beneficios esperados</h3>
  <ul>
    <li>Detección temprana de caries, enfermedad periodontal, lesiones de los tejidos blandos y otras alteraciones.</li>
    <li>Eliminación del dolor y de focos infecciosos, y prevención de complicaciones.</li>
    <li>Recuperación de la función, la estética y la calidad de vida.</li>
  </ul>

  <h3>5. Riesgos generales</h3>
  <p>Todo procedimiento odontológico implica riesgos, aun cuando se realice con la técnica adecuada. Los riesgos específicos que me fueron explicados y que acepto están marcados uno a uno en el apartado «Detalle del procedimiento». Además, pueden presentarse de forma excepcional: reacciones alérgicas a materiales, lesiones de los tejidos blandos por el instrumental, deglución o aspiración de pequeños instrumentos o fragmentos, y desajustes o desprendimientos de restauraciones que requieran repetición.</p>

  <h3>6. Alternativas</h3>
  <p>Según el diagnóstico pueden existir alternativas como restauraciones directas o indirectas, extracción en lugar de endodoncia, prótesis removible en lugar de fija, remisión a un especialista o la observación y control periódico. El profesional me explicó las alternativas disponibles para mi caso, con sus ventajas, desventajas y costos.</p>

  <h3>7. Consecuencias de no tratarme</h3>
  <p>Si decido no realizar el tratamiento, las enfermedades pueden progresar y producir dolor, infecciones que se extiendan a otros tejidos, pérdida de dientes y de hueso, alteraciones de la mordida y tratamientos posteriores más complejos y costosos.</p>

  ${CI_COMMON_CLOSING}
</section>
`.trim();
