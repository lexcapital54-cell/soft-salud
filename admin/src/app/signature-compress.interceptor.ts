import { HttpInterceptorFn } from '@angular/common/http';
import { from, switchMap } from 'rxjs';

/** El servidor acepta cuerpos JSON de hasta 100 KB: las firmas viajan reducidas. */
const MIN_BYTES_TO_COMPRESS = 12 * 1024;
const MAX_WIDTH = 600;
const MAX_HEIGHT = 240;
const SIGNATURE_KEY = /signature/i;
const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|webp);base64,/i;

const cache = new Map<string, string>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Firma ilegible'));
    img.src = src;
  });
}

/** Firma reducida en PNG (conserva la transparencia); si no gana tamaño, queda la original. */
async function compressSignature(dataUrl: string): Promise<string> {
  const hit = cache.get(dataUrl);
  if (hit) return hit;
  let result = dataUrl;
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, MAX_WIDTH / img.naturalWidth, MAX_HEIGHT / img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Pocos niveles de color y opacidad: el trazo se ve igual y el PNG pesa ~4 veces menos.
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = pixels.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 24) {
          d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
          continue;
        }
        d[i] = Math.round(d[i] / 51) * 51;
        d[i + 1] = Math.round(d[i + 1] / 51) * 51;
        d[i + 2] = Math.round(d[i + 2] / 51) * 51;
        d[i + 3] = Math.max(85, Math.round(d[i + 3] / 85) * 85);
      }
      ctx.putImageData(pixels, 0, 0);
      const png = canvas.toDataURL('image/png');
      if (png.length < dataUrl.length) result = png;
    }
  } catch {
    result = dataUrl;
  }
  if (cache.size > 30) cache.clear();
  cache.set(dataUrl, result);
  cache.set(result, result);
  return result;
}

function needsWork(value: unknown, key = ''): boolean {
  if (typeof value === 'string') {
    return SIGNATURE_KEY.test(key) && value.length > MIN_BYTES_TO_COMPRESS && IMAGE_DATA_URL.test(value);
  }
  if (Array.isArray(value)) return value.some((v) => needsWork(v, key));
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([k, v]) => needsWork(v, k));
  }
  return false;
}

async function shrink(value: unknown, key = ''): Promise<unknown> {
  if (typeof value === 'string') {
    return SIGNATURE_KEY.test(key) && value.length > MIN_BYTES_TO_COMPRESS && IMAGE_DATA_URL.test(value)
      ? compressSignature(value)
      : value;
  }
  if (Array.isArray(value)) return Promise.all(value.map((v) => shrink(v, key)));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = await Promise.all(
      Object.entries(value).map(async ([k, v]) => [k, await shrink(v, k)] as const),
    );
    return Object.fromEntries(entries);
  }
  return value;
}

/** Reduce las imágenes de firma (campos *signature*) antes de enviar el JSON al servidor. */
export const signatureCompressInterceptor: HttpInterceptorFn = (req, next) => {
  const body = req.body;
  if (
    !['POST', 'PUT', 'PATCH'].includes(req.method) ||
    !body ||
    typeof body !== 'object' ||
    body instanceof FormData ||
    body instanceof Blob ||
    !needsWork(body)
  ) {
    return next(req);
  }
  return from(shrink(body)).pipe(switchMap((compressed) => next(req.clone({ body: compressed }))));
};
