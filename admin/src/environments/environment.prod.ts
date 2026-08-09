/** Entorno de producción: admin en app.habilisalud.com, landing en el dominio raíz. */
export const environment = {
  production: true,
  /** Netlify hace de proxy de /api hacia la API en Render. */
  apiBase: '/api',
  websiteUrl: 'https://www.habilisalud.com',
};
