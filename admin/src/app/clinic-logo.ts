/**
 * Logo propio del consultorio: `public/clinic-logos/<clinicId>.jpg`.
 * Si el archivo no existe, la vista oculta la imagen (evento `error`) y deja la marca por defecto.
 */
export function clinicLogoUrl(clinicId: string | null | undefined): string | null {
  return clinicId ? `/clinic-logos/${clinicId}.jpg` : null;
}
