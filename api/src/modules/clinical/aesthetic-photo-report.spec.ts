import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Content } from 'pdfmake/interfaces';
import { PhotoReportPhoto, aestheticPhotoReportDoc, groupByAngle, imageDataUrl } from './aesthetic-photo-report.pdf';
import { AestheticPhotoReportService } from './aesthetic-photo-report.service';

/** PNG de 1×1 px; las pruebas no usan fotos de pacientes. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** Para revisar el PDF a ojo se usan las imágenes del catálogo de servicios (no son de pacientes). */
function sampleImage(i: number): string | null {
  const dir = join(__dirname, '../../../../admin/public/services/aesthetic');
  try {
    const files = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f));
    return files.length ? imageDataUrl(readFileSync(join(dir, files[i % files.length]))) : null;
  } catch {
    return null;
  }
}

const photo = (id: string, angle: string, moment: string, date: string, i: number): PhotoReportPhoto => ({
  id,
  angle,
  moment,
  date,
  note: moment === 'DESPUES' ? 'Control a los 15 días' : '',
  procedureType: 'TOXINA',
  image: (process.env.AES_PHOTO_OUT && sampleImage(i)) || imageDataUrl(PNG),
});

const photos = [
  photo('f3', 'PERFIL_DER', 'ANTES', '2026-01-10', 2),
  photo('f2', 'FRONTAL', 'DESPUES', '2026-01-25', 1),
  photo('f1', 'FRONTAL', 'ANTES', '2026-01-10', 0),
  { ...photo('f4', 'DETALLE', 'CONTROL', '2026-02-01', 3), image: null },
];

const input = {
  provider: { name: 'Consultorio Ficticio', nit: '900000000-1', habilitationCode: null },
  patient: { name: 'Paciente Ficticia', document: 'CC 123', age: 35 },
  generatedBy: 'Médica Ficticia',
  generatedAt: new Date('2026-03-01T15:00:00Z'),
  photos,
  compare: { before: 'f1', after: 'f2' },
};

describe('Informe fotográfico de estética (datos ficticios)', () => {
  it('reconoce JPG y PNG y rechaza otros formatos', () => {
    expect(imageDataUrl(PNG)).toMatch(/^data:image\/png;base64,/);
    expect(imageDataUrl(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toMatch(/^data:image\/jpeg;base64,/);
    expect(imageDataUrl(Buffer.from('GIF89a'))).toBeNull();
  });

  it('agrupa por ángulo y ordena por fecha y momento', () => {
    const groups = groupByAngle(photos);
    expect(groups.map((g) => g.angle)).toEqual(['FRONTAL', 'PERFIL_DER', 'DETALLE']);
    expect(groups[0].list.map((p) => p.id)).toEqual(['f1', 'f2']);
  });

  it('incluye el comparativo y avisa cuando una imagen no es compatible', () => {
    const doc = aestheticPhotoReportDoc(input);
    const text = JSON.stringify(doc.content as Content[]);
    expect(text).toContain('COMPARATIVO · FRONTAL');
    expect(text).toContain('VISTA PERFIL DERECHO (1)');
    expect(text).toContain('solo JPG o PNG');
    expect(text).not.toMatch(/recomend|dosis sugerida/i);
  });

  it('genera un PDF válido', async () => {
    const service = new AestheticPhotoReportService(null as never, null as never);
    const buffer = await (service as unknown as { render: (d: unknown) => Promise<Buffer> }).render(aestheticPhotoReportDoc(input));
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    if (process.env.AES_PHOTO_OUT) writeFileSync(process.env.AES_PHOTO_OUT, buffer);
  });
});
