/**
 * Comprobación manual del semáforo documental sin pasar por HTTP.
 * Uso: npx ts-node scripts/check-documents-overview.ts
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DocumentsService } from '../src/modules/documents/documents.service';
import { PrismaService } from '../src/prisma/prisma.module';
import type { User } from '../src/users/user.entity';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });

  const prisma = app.get(PrismaService);
  const documents = app.get(DocumentsService);

  const user = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!user) throw new Error('No hay usuario ADMIN con consultorio');

  const overview = await documents.overview(user as unknown as User);

  console.log('Resumen global:', JSON.stringify(overview.summary));
  console.log('');
  for (const pillar of overview.pillars) {
    console.log(
      pillar.label.padEnd(34),
      'cat:',
      String(pillar.categories.length).padStart(2),
      '| verde',
      String(pillar.summary.green).padStart(3),
      'amarillo',
      String(pillar.summary.yellow).padStart(3),
      'rojo',
      String(pillar.summary.red).padStart(3),
      'opc',
      String(pillar.summary.optional).padStart(2),
      '|',
      `${pillar.summary.compliance}%`,
    );
  }

  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
