import { API } from './api.config';

export type ClinicLogoSlot = 'home' | 'hc' | 'formatos';

/**
 * Logo propio del consultorio, guardado en la base de datos desde Configuración.
 * `hc` usa el logo de historia clínica y, si no hay, el del panel de inicio; 404 si no tiene ninguno.
 * `v` fuerza a recargar la imagen justo después de cambiarla.
 */
export function clinicLogoUrl(
  clinicId: string | null | undefined,
  slot: ClinicLogoSlot,
  v?: string | number | null,
): string | null {
  if (!clinicId) return null;
  return `${API}/public/clinic-logo/${clinicId}/${slot}${v ? `?v=${encodeURIComponent(String(v))}` : ''}`;
}
