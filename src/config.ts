/**
 * URL del admin clínico (Angular). En desarrollo apunta al `ng serve` local y
 * en el build de producción al subdominio de Netlify. Se puede sobrescribir
 * con VITE_ADMIN_URL sin recompilar la configuración.
 */
const ADMIN_URL =
  import.meta.env.VITE_ADMIN_URL ??
  (import.meta.env.DEV ? 'http://localhost:4200' : 'https://app.habilisalud.com')

/** Enlace de acceso al admin según el portal: profesional o administrativo. */
export function loginUrl(tipo: 'profesional' | 'admin') {
  return `${ADMIN_URL}/login?tipo=${tipo}`
}
