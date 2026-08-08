/**
 * Smoke test local del motor PDF (Paso 3).
 * Uso: npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/smoke-consent-pdf.ts
 */
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { fillConsentPlaceholders } from '../src/modules/clinical/consent-placeholders';
import { ConsentPdfService } from '../src/modules/clinical/consent-pdf.service';

async function main() {
  const storageRoot = path.join(process.cwd(), 'storage');
  const config = {
    get: (key: string) => (key === 'STORAGE_ROOT' ? storageRoot : undefined),
  } as ConfigService;

  const pdf = new ConsentPdfService(config);
  const consentId = '00000000-0000-4000-8000-000000000099';
  const clinicId = '_smoke';

  const rawHtml = `
<section>
  <h2>AUTORIZACIÓN DE PRUEBA</h2>
  <p><strong>Ciudad y Fecha:</strong> ___________________________</p>
  <p>Yo, ________________________________________________, identificado(a) con C.C. / C.E. No. _________________ de _________________, autorizo el tratamiento.</p>
  <p>Profesional: psicólogo(a) _____________________________________, Tarjeta Profesional No. ______________.</p>
</section>
`.trim();

  const bodyHtml = fillConsentPlaceholders(rawHtml, {
    signerName: 'Ana Pérez Demo',
    signerDocumentType: 'CC',
    signerDocumentNumber: '1053888000',
    city: 'Manizales',
    patientName: 'Ana Pérez Demo',
    professionalName: 'Dra. Laura Gómez',
    professionalCard: '12345',
    signedAt: new Date(),
  });

  // Firma PNG 1x1 blanca mínima
  const signatureBase64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const result = await pdf.seal({
    consentId,
    clinicId,
    clinicName: 'Consultorio Demo Psicología',
    clinicAddress: 'Calle 1 # 2-3',
    clinicPhone: '3000000000',
    templateCode: 'HABEAS_DATA',
    templateTitle: 'Autorización tratamiento de datos (smoke)',
    templateVersion: 1,
    bodyHtml,
    patientName: 'Ana Pérez Demo',
    patientDocument: '1053888000',
    patientDocumentType: 'CC',
    signerName: 'Ana Pérez Demo',
    signerDocument: 'CC 1053888000',
    signatureBase64,
    signedAt: new Date(),
    ipAddress: '127.0.0.1',
    userAgent: 'smoke-consent-pdf',
    encounterId: null,
    professionalName: 'Dra. Laura Gómez',
    professionalCard: '12345',
  });

  const stat = fs.statSync(result.absolutePath);
  if (stat.size < 500) {
    throw new Error(`PDF demasiado pequeño: ${stat.size} bytes`);
  }
  if (!bodyHtml.includes('Ana Pérez Demo')) {
    throw new Error('Placeholders no se rellenaron');
  }
  console.log('OK smoke consent PDF');
  console.log(' path:', result.absolutePath);
  console.log(' key:', result.pdfStorageKey);
  console.log(' hash:', result.contentHash);
  console.log(' size:', stat.size);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
