/**
 * Re-sella PDFs de Natalia y Kelly con el profesional correcto de cada consultorio.
 * Ejecutar en contenedor tras rebuild: node /tmp/rebrand-psych-clinics.js
 */
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('/app/dist/src/app.module');
const { DocumentsService } = require('/app/dist/src/modules/documents/documents.service');
const { PrismaService } = require('/app/dist/src/prisma/prisma.module');

const CLINICS = [
  'b2e8b662-47a4-4b54-af07-3439a5d32852', // Natalia
  '976f4270-740a-444c-a196-ed6d52d22db1', // Kelly
];

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const prisma = app.get(PrismaService);
  const documents = app.get(DocumentsService);
  const sa = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (!sa) throw new Error('No SUPER_ADMIN');

  for (const clinicId of CLINICS) {
    const result = await documents.rebrandClinicPdfs(sa, clinicId);
    console.log(JSON.stringify(result));
  }
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
