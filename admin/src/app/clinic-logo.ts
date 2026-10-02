/**
 * Logo propio del consultorio en `public/clinic-logos/`:
 * - `<clinicId>.jpg`: logo general (panel de inicio y, si no hay otro, historia clínica).
 * - `<clinicId>-hc.png`: logo exclusivo de la historia clínica (opcional, admite transparencia).
 * Al reemplazar un logo, suba `v` para que los navegadores no muestren el anterior.
 * Las vistas prueban los candidatos en orden y pasan al siguiente en el evento `error`.
 */
export function clinicLogoCandidates(clinicId: string | null | undefined): string[] {
  if (!clinicId) return [];
  return [`/clinic-logos/${clinicId}-hc.png?v=2`, `/clinic-logos/${clinicId}.jpg?v=2`];
}
