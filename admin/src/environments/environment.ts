/**
 * Entorno de desarrollo. `ng build` lo reemplaza por environment.prod.ts
 * (ver fileReplacements en angular.json).
 */
export const environment = {
  production: false,
  /**
   * Ruta relativa a propósito: en desarrollo la sirve el proxy de `ng serve`
   * y en producción el de Netlify, así el navegador siempre ve mismo origen y
   * no hay preflight de CORS que los filtros de red puedan descartar.
   */
  apiBase: '/api',
  /** Landing pública (Vite) corriendo en local. */
  websiteUrl: 'http://localhost:5173',
};
