/**
 * Consultorios que pidieron los colores de habilisalud.com (azul marino y turquesa).
 * La misma lista está en public/consultorio.html para el panel de inicio.
 */
export const WEB_THEME_CLINICS: readonly string[] = ['b2e8b662-47a4-4b54-af07-3439a5d32852'];

export function usesWebTheme(clinicId: string | null | undefined): boolean {
  return !!clinicId && WEB_THEME_CLINICS.includes(clinicId);
}
