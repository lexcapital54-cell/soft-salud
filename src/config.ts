/**
 * URL del admin clínico (Angular). En desarrollo apunta al `ng serve` local y
 * en producción al Mac mini (Caddy + Cloudflare Tunnel). Sobrescribe con
 * VITE_ADMIN_URL al hacer el build de la landing para el hosting.
 */
const ADMIN_URL =
  import.meta.env.VITE_ADMIN_URL ??
  (import.meta.env.DEV ? 'http://localhost:4200' : 'https://app.habilisalud.com')

/** Enlace de acceso al admin según el portal: profesional o administrativo. */
export function loginUrl(tipo: 'profesional' | 'admin') {
  return `${ADMIN_URL}/login?tipo=${tipo}`
}
