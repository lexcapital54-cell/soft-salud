/** Ninguna imagen de la historia clínica debe superar 100 KB al subirse. */
export const IMAGE_TARGET_MAX_BYTES = 100 * 1024;

const START_MAX_DIMENSION = 1600;
const MIN_DIMENSION = 320;
const QUALITIES = [0.82, 0.72, 0.62, 0.52, 0.44, 0.36];

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
 * Reduce una imagen a JPEG de máximo 100 KB bajando calidad y, si hace falta, tamaño.
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

/** Comprime la imagen del campo `field` de un formulario antes de enviarlo. */
export async function compressFormImage(form: FormData, field = 'file'): Promise<FormData> {
  const entry = form.get(field);
  if (!(entry instanceof File) || !entry.type.startsWith('image/')) return form;
  const compressed = await compressImageForUpload(entry);
  if (compressed === entry) return form;
  form.set(field, compressed, compressed.name);
  return form;
}
