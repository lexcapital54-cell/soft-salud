export type ConsentPlaceholderData = {
  signerName: string;
  signerDocumentType: string;
  signerDocumentNumber: string;
  city?: string;
  patientName?: string;
  professionalName?: string;
  professionalCard?: string;
  signedAt?: Date;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Rellena guiones de plantillas legales con datos del firmante/paciente.
 * Misma lógica que la vista previa Angular (ConsentSigner).
 */
export function fillConsentPlaceholders(
  html: string,
  data: ConsentPlaceholderData,
): string {
  const name = (data.signerName || '').replace(/\s+/g, ' ').trim();
  const docType = (data.signerDocumentType || 'CC').trim();
  const docNum = (data.signerDocumentNumber || '').trim();
  const city = (data.city || 'Manizales').replace(/\s+/g, ' ').trim();
  const patient = (data.patientName || name).replace(/\s+/g, ' ').trim();
  const professional = (data.professionalName || '').replace(/\s+/g, ' ').trim();
  const card = (data.professionalCard || 'Pendiente').trim();
  const when = data.signedAt || new Date();
  const today = when.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  let out = html;

  out = out.replace(
    /(<strong>Ciudad y Fecha:<\/strong>\s*)_+/gi,
    `$1<strong>${escapeHtml(city)}, ${escapeHtml(today)}</strong>`,
  );

  // Reemplazos contextuales (orden importa).
  out = out.replace(
    /(Yo,\s*|Nosotros \(o Yo\),\s*)_{10,}/i,
    `$1<strong>${escapeHtml(name || '[Nombre del firmante]')}</strong>`,
  );
  out = out.replace(
    /(C\.C\. \/ C\.E\. \/ T\.I\. No\.|C\.C\. \/ C\.E\. No\.|C\.C\. No\.|documento No\.)\s*_{5,}/gi,
    `$1 <strong>${escapeHtml(`${docType} ${docNum || '[Número]'}`)}</strong>`,
  );
  out = out.replace(
    /(\bde\s)_{5,}(,|\s)/gi,
    `$1<strong>${escapeHtml(city)}</strong>$2`,
  );
  out = out.replace(
    /(menor\/paciente|menor|representado\(a\))\s*_{10,}/gi,
    `$1 <strong>${escapeHtml(patient || '[Paciente / menor]')}</strong>`,
  );
  out = out.replace(
    /(psicólogo\(a\)\s*)_{5,}/gi,
    `$1<strong>${escapeHtml(professional || '[Profesional]')}</strong>`,
  );
  out = out.replace(
    /(Tarjeta Profesional No\.\s*)_{5,}/gi,
    `$1<strong>${escapeHtml(card)}</strong>`,
  );

  // Cola para guiones restantes (p. ej. segundo acudiente en NNA).
  const queue = [
    name || '[Nombre]',
    `${docType} ${docNum || '[Número]'}`,
    city,
    patient || name || '[Paciente]',
    professional || '[Profesional]',
    card,
    name || '[Nombre]',
    `${docType} ${docNum || '[Número]'}`,
    professional || '[Profesional]',
    card,
  ];
  let i = 0;
  out = out.replace(/_{5,}/g, () => {
    const value = queue[Math.min(i, queue.length - 1)] || '—';
    i += 1;
    return `<strong>${escapeHtml(value)}</strong>`;
  });

  return out;
}
