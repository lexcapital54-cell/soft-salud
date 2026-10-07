/** Fotos y archivos de la historia clínica quedan entre 100 y 300 KB al subirse. */
export const IMAGE_TARGET_MAX_BYTES = 300 * 1024;
/** Los modelos 3D no se pueden comprimir sin dañar la malla; conservan su límite propio. */
const MODEL_3D_EXT = /\.(stl|obj|ply)$/i;

const START_MAX_DIMENSION = 2000;
const MIN_DIMENSION = 480;
// Se prueba de mayor a menor calidad y se queda con la primera que cabe, para no bajar de más.
const QUALITIES = [0.9, 0.84, 0.78, 0.7, 0.62, 0.54, 0.46];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen.'));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/**
 * Reduce una imagen a JPEG de máximo 300 KB bajando calidad y, si hace falta, tamaño.
 * Si el archivo no es una imagen que el navegador pueda decodificar, o ya pesa menos
 * del objetivo, se devuelve sin cambios.
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
  if (file.size <= IMAGE_TARGET_MAX_BYTES) return file;

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return file;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx || !img.naturalWidth || !img.naturalHeight) return file;

  let maxDim = Math.min(START_MAX_DIMENSION, Math.max(img.naturalWidth, img.naturalHeight));
  let best: Blob | null = null;

  while (true) {
    const scale = maxDim / Math.max(img.naturalWidth, img.naturalHeight);
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    for (const q of QUALITIES) {
      const blob = await toBlob(canvas, q);
      if (!blob) continue;
      if (!best || blob.size < best.size) best = blob;
      if (blob.size <= IMAGE_TARGET_MAX_BYTES) {
        best = blob;
        break;
      }
    }
    if ((best && best.size <= IMAGE_TARGET_MAX_BYTES) || maxDim <= MIN_DIMENSION) break;
    maxDim = Math.max(MIN_DIMENSION, Math.round(maxDim * 0.8));
  }

  if (!best || best.size >= file.size) return file;
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  return new File([best], name, { type: 'image/jpeg', lastModified: Date.now() });
}

/** Mensaje en español si el archivo sigue superando el máximo tras comprimirlo, o null. */
export function oversizeMessage(file: File): string | null {
  if (file.size <= IMAGE_TARGET_MAX_BYTES || MODEL_3D_EXT.test(file.name)) return null;
  return `${file.name} pesa ${Math.round(file.size / 1024)} KB; el máximo es 300 KB. Redúzcalo o expórtelo con menor calidad.`;
}

/**
 * Comprime la imagen del campo `field` de un formulario antes de enviarlo.
 * Rechaza con `{ error: { message } }` (como un error HTTP) si el archivo sigue superando 300 KB.
 */
export async function compressFormImage(form: FormData, field = 'file'): Promise<FormData> {
  const entry = form.get(field);
  if (!(entry instanceof File)) return form;
  const compressed = entry.type.startsWith('image/') ? await compressImageForUpload(entry) : entry;
  const tooBig = oversizeMessage(compressed);
  if (tooBig) throw { error: { message: tooBig } };
  if (compressed !== entry) form.set(field, compressed, compressed.name);
  return form;
}
