/**
 * Ruta relativa a propósito: el dev server hace de proxy hacia NestJS
 * (ver proxy.conf.json), así el navegador ve todo como mismo origen y no hay
 * preflight de CORS que los filtros de red o las extensiones puedan descartar.
 */
export const API = '/api';
