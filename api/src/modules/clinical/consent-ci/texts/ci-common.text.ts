/**
 * Bloques legales comunes de los CI odontológicos. Los guiones bajos se
 * diligencian con `fillConsentPlaceholders` (mismo orden que la vista previa).
 */
export function ciHeader(title: string, code: string): string {
  return `
  <h2>${title}</h2>
  <p><strong>Código:</strong> ${code} &nbsp;·&nbsp; <strong>Ciudad y Fecha:</strong> ___________________________</p>

  <p>Yo, ________________________________________________, identificado(a) con documento No. _________________, obrando en nombre propio o como representante legal del paciente ________________________________________________, declaro que he sido informado(a) de manera clara, suficiente y oportuna por el/la odontólogo(a) _____________________________________, con Registro Profesional No. ______________, sobre el diagnóstico, el procedimiento propuesto, sus beneficios, riesgos, alternativas y las consecuencias de no realizarlo, en los términos que se describen a continuación y en el apartado «Detalle del procedimiento» que forma parte integral de este documento.</p>`;
}

export const CI_COMMON_CLOSING = `
  <h3>Compromisos del paciente</h3>
  <ul>
    <li>Seguir las indicaciones de higiene, alimentación, medicación y cuidados entregadas por el profesional.</li>
    <li>Asistir puntualmente a las citas de control; la inasistencia puede comprometer el resultado y aumentar los riesgos.</li>
    <li>Informar de inmediato cualquier dolor intenso, sangrado persistente, fiebre, inflamación creciente o reacción inesperada.</li>
    <li>Actualizar cualquier cambio en mi estado de salud, medicamentos, embarazo o alergias.</li>
  </ul>

  <h3>Costos y plan de tratamiento</h3>
  <p>El plan de tratamiento, su presupuesto, las fases y las formas de pago me fueron explicados y constan en la historia clínica y en los documentos de cobro. Los procedimientos adicionales no previstos que resulten necesarios me serán informados antes de realizarse.</p>

  <h3>Historia clínica y tratamiento de datos personales</h3>
  <p>La información de mi atención, incluidas radiografías, fotografías, modelos y registros, hace parte de la historia clínica, documento privado y sometido a reserva, que se custodia conforme a la Resolución 1995 de 1999, la Ley 2015 de 2020 y las normas vigentes de historia clínica electrónica. Mis datos personales y sensibles se tratan de acuerdo con la Ley 1581 de 2012 y el Decreto 1377 de 2013, únicamente para la prestación del servicio, la gestión administrativa y los reportes obligatorios al sistema de salud.</p>

  <h3>Firma electrónica</h3>
  <p>Acepto firmar este documento por medios electrónicos. La firma manuscrita digitalizada, junto con la fecha, la hora, la dirección IP, el dispositivo y el código de integridad (hash SHA-256) registrados al firmar, tiene la misma validez que la firma manuscrita, conforme a la Ley 527 de 1999 y el Decreto 2364 de 2012. El documento queda sellado y cualquier modificación posterior alteraría su código de integridad.</p>

  <h3>Derecho a revocar</h3>
  <p>Puedo revocar este consentimiento en cualquier momento antes o durante el tratamiento, mediante la sección de revocatoria de este documento o por escrito ante el profesional, sin necesidad de justificar mi decisión. La revocatoria no tiene efectos sobre los procedimientos ya realizados, no elimina la historia clínica (que debe conservarse por ley) y puede implicar riesgos derivados de suspender el tratamiento, que me serán explicados.</p>

  <h3>Pacientes menores de edad o con apoyo</h3>
  <p>Cuando el paciente es menor de edad o requiere apoyo para la toma de decisiones, este consentimiento lo otorga su representante legal o persona de apoyo. Se escuchará la opinión del menor según su madurez y, cuando corresponda, se dejará constancia de su asentimiento.</p>

  <h3>Declaración final</h3>
  <p>Declaro que he leído (o me ha sido leído) este documento, que comprendo su contenido, que se resolvieron todas mis dudas y que, de manera libre, voluntaria y consciente, <strong>OTORGO MI CONSENTIMIENTO</strong> para la realización del procedimiento descrito. Recibo copia del documento firmado.</p>`;
