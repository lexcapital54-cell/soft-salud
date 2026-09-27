/**
 * Replica estructura + archivos de Natalia Ángel Úsuga → Dra Kelly Tatiana Marín.
 * Los PDF se autodiligencian con nombre/datos del consultorio destino.
 *
 * Uso (en contenedor): npx ts-node scripts/replicate-natalia-to-kelly.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentsService } from '../src/modules/documents/documents.service';
import { PrismaService } from '../src/prisma/prisma.module';
import type { User } from '../src/users/user.entity';

const NATALIA_CLINIC_ID = 'b2e8b662-47a4-4b54-af07-3439a5d32852';
const KELLY_CLINIC_ID = '976f4270-740a-444c-a196-ed6d52d22db1';
const KELLY_USER_ID = '694fee36-2808-4c48-aa84-29a9f633360d';
const KELLY_DISPLAY_NAME = 'Dra Kelly Tatiana Marin';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const prisma = app.get(PrismaService);
  const documents = app.get(DocumentsService);

  const sa = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN' } });
  if (!sa) throw new Error('No hay SUPER_ADMIN');

  await prisma.user.update({
    where: { id: KELLY_USER_ID },
    data: { fullName: KELLY_DISPLAY_NAME },
  });
  console.log(`Nombre profesional destino → ${KELLY_DISPLAY_NAME}`);

  const sourceCount = await prisma.documentRequirement.count({
    where: { clinicId: NATALIA_CLINIC_ID },
  });
  const sourceFiles = await prisma.documentFile.count({
    where: {
      requirement: { clinicId: NATALIA_CLINIC_ID },
      status: { not: 'RETIRED' },
    },
  });
  console.log(
    `Origen Natalia: ${sourceCount} requisitos, ${sourceFiles} archivos activos`,
  );

  const result = await documents.replicateDocuments(sa as unknown as User, {
    sourceClinicId: NATALIA_CLINIC_ID,
    targetClinicIds: [KELLY_CLINIC_ID],
    includeFiles: true,
  });

  console.log(JSON.stringify(result, null, 2));

  const kellyReqs = await prisma.documentRequirement.findMany({
    where: { clinicId: KELLY_CLINIC_ID },
    include: {
      files: {
        where: { status: { not: 'RETIRED' } },
        select: { id: true },
      },
    },
  });
  const enabled = kellyReqs.filter((r) => r.isEnabled).length;
  const withFiles = kellyReqs.filter((r) => r.files.length > 0).length;
  console.log(
    `Destino Kelly: ${kellyReqs.length} requisitos, ${enabled} habilitados, ${withFiles} con archivo`,
  );

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
