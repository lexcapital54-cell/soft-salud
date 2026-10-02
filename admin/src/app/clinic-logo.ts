/**
 * Logo propio del consultorio: `public/clinic-logos/<clinicId>.jpg`.
 * Al reemplazar un logo, suba `v` para que los navegadores no muestren el anterior.
 * Si el archivo no existe, la vista oculta la imagen (evento `error`) y deja la marca por defecto.
 */
export function clinicLogoUrl(clinicId: string | null | undefined): string | null {
  return clinicId ? `/clinic-logos/${clinicId}.jpg?v=2` : null;
}
