/**
 * Normaliza texto libre de la HCE: oración con mayúscula inicial, resto en
 * minúsculas, espacios y acentos frecuentes en dictado por voz (es-CO).
 */
const ACCENT_FIXES: ReadonlyArray<[RegExp, string]> = [
  [/\btambien\b/gi, 'también'],
  [/\bademas\b/gi, 'además'],
  [/\bdespues\b/gi, 'después'],
  [/\basi\b/gi, 'así'],
  [/\bunicamente\b/gi, 'únicamente'],
  [/\bunico\b/gi, 'único'],
  [/\bunica\b/gi, 'única'],
  [/\bnumero\b/gi, 'número'],
  [/\binformacion\b/gi, 'información'],
  [/\bevaluacion\b/gi, 'evaluación'],
  [/\bobservacion\b/gi, 'observación'],
  [/\bmedicacion\b/gi, 'medicación'],
  [/\bpsiquiatria\b/gi, 'psiquiatría'],
  [/\bpsicologia\b/gi, 'psicología'],
  [/\bdepresion\b/gi, 'depresión'],
  [/\brevision\b/gi, 'revisión'],
  [/\bpercepcion\b/gi, 'percepción'],
  [/\bideacion\b/gi, 'ideación'],
  [/\bremision\b/gi, 'remisión'],
  [/\bremitido\b/gi, 'remitido'],
  [/\bremitida\b/gi, 'remitida'],
  [/\bdiagnostico\b/gi, 'diagnóstico'],
  [/\bdiagnosticos\b/gi, 'diagnósticos'],
  [/\bsintomatologia\b/gi, 'sintomatología'],
  [/\bevolucion\b/gi, 'evolución'],
  [/\batencion\b/gi, 'atención'],
  [/\bemocion\b/gi, 'emoción'],
  [/\borganizacion\b/gi, 'organización'],
  [/\bcomunicacion\b/gi, 'comunicación'],
  [/\brelacion\b/gi, 'relación'],
  [/\brelaciones\b/gi, 'relaciones'],
];

const LOCALE = 'es-CO';

/** Primera letra de cada oración en mayúscula; el resto en minúsculas. */
function applySentenceCase(text: string): string {
  const lower = text.toLocaleLowerCase(LOCALE);
  if (!lower) return lower;

  let result = lower.charAt(0).toLocaleUpperCase(LOCALE) + lower.slice(1);
  result = result.replace(/([.!?…]+\s+)([a-záéíóúüñ])/g, (_, punct, ch) =>
    punct + ch.toLocaleUpperCase(LOCALE),
  );
  result = result.replace(/(\n\s*)([a-záéíóúüñ])/g, (_, nl, ch) => nl + ch.toLocaleUpperCase(LOCALE));
  return result;
}

function fixOrthography(text: string): string {
  let out = text;
  for (const [pattern, replacement] of ACCENT_FIXES) {
    out = out.replace(pattern, replacement);
  }
  out = out.replace(/\s+([,.;:!?])/g, '$1');
  out = out.replace(/([,.;:!?])([^\s\n])/g, '$1 $2');
  out = out.replace(/[ \t]{2,}/g, ' ');
  return out;
}

export function formatClinicalFreeText(raw: string): string {
  if (!raw) return raw;
  const normalized = raw.normalize('NFC').replace(/\r\n/g, '\n');
  if (!normalized.trim()) return normalized;

  const fixed = fixOrthography(normalized.trimEnd());
  return applySentenceCase(fixed);
}
