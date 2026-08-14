/** Entorno de producción: admin + API detrás del mismo origen (Caddy en el Mac mini). */
export const environment = {
  production: true,
  /**
   * Ruta relativa: Caddy (Docker) reenvía /api al Nest del Mac mini.
   * Misma origen → sin CORS frágil entre landing hosting y app.
   */
  apiBase: '/api',
  /** Landing pública en Latinoamérica Hosting. */
  websiteUrl: 'https://www.habilisalud.com',
};
