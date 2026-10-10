/** Fotos del catálogo base de estética (las mismas del proyecto original), por nombre del servicio. */
const IMAGES: ReadonlyArray<[name: string, src: string, focus: string]> = [
  ['Belotero Revive / PDRN esperma de salmón', 'belotero-pdrn.jpg', 'center'],
  ['Bruxismo', 'bruxismo.jpg', 'center'],
  ['Dermapen', 'dermapen.jpg', 'center'],
  ['Enzimas Para Papada', 'enzimas-papada.jpg', 'center'],
  ['Exosomas', 'exosomas.jpg', 'center'],
  ['Hidratación Facial + 5 Sesiones De Tensamax', 'hidratacion-tensamax.jpg', 'center'],
  ['Limpieza Facial Basica', 'limpieza-facial-basica.jpg', 'center'],
  ['Limpieza Facial Profunda', 'limpieza-facial-profunda.jpg', 'center'],
  ['Peeling', 'peeling.jpg', '78% 18%'],
  ['Radiesse', 'radiesse.jpg', '32% 40%'],
  ['Sesion De Tensamax', 'sesion-tensamax.jpg', '30% 30%'],
  ['Sesión Casmara', 'sesion-casmara.jpg', '40% 40%'],
  ['Sesión Mesoterapia Capilar', 'mesoterapia-capilar.jpg', '48% 42%'],
  ['Skin Booster', 'skin-booster.jpg', '68% 38%'],
  ['Toxina Botulinica (50 Unidades)', 'toxina-botulinica.jpg', '25% 58%'],
  ['Vitaminas Faciales NCTF', 'vitaminas-nctf.jpg', '22% 58%'],
  ['Ácido Hialurónico Para Labios', 'labios.jpg', '22% 58%'],
  ['Ácido Hialurónico Para Ojeras', 'acido-hialuronico-ojeras.jpg', '22% 58%'],
  ['Exilis Ultra 360° — Paquetes faciales', 'exilis-ultra-360-paquetes-faciales.jpg', 'center'],
  ['Masaje Relajante Cuerpo Completo', 'masaje-reductor.jpg', 'center'],
  ['Masaje Relajante Espalda Y Brazos', 'masaje-relajante-espalda.jpg', '50% 38%'],
  ['Paquete Masaje Reafirmante De Gluteos', 'masaje-reafirmante-gluteos.jpg', '48% 28%'],
  ['Paquete Masaje Reafirmante De Gluteos Con Vitamina C', 'masaje-reafirmante-gluteos-vitamina-c.jpg', '50% 32%'],
  ['Paquete Masajes De Reducción (Con Inyectables)', 'masajes-reduccion-inyectables.jpg', '40% 32%'],
  ['Paquete Masajes De Reducción (Sin Inyectables)', 'masajes-reduccion-sin-inyectables.jpg', '48% 28%'],
  ['Sesión Masaje Reafirmante De Gluteos', 'sesion-masaje-reafirmante-gluteos.jpg', '48% 28%'],
  ['Sesión Masaje Reafirmante De Gluteos Con VItamina C', 'sesion-masaje-reafirmante-gluteos-vitamina-c.jpg', '50% 32%'],
  ['Sesión Masajes De Reducción (Con Inyectables)', 'sesion-masajes-reduccion-inyectables.jpg', '50% 32%'],
  ['Sesión Masajes De Reducción (Sin Inyectables)', 'vacumterapia.jpg', 'center'],
  ['Tratamiento Para Celulitis (10 Sesiones)', 'tratamiento-celulitis.jpg', '48% 28%'],
  ['Exilis Ultra 360° — Paquetes corporales', 'exilis-ultra-360-paquetes-corporales.jpg', '32% 40%'],
  ['Valoración', 'valoracion.jpg', 'center'],
];

const key = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const BY_NAME = new Map(IMAGES.map(([name, file, focus]) => [key(name), { src: `/services/aesthetic/${file}`, focus }]));

/** Foto del servicio o null si no es del catálogo base (o se renombró). */
export function aestheticServiceImage(name: string): { src: string; focus: string } | null {
  return BY_NAME.get(key(name)) ?? null;
}
