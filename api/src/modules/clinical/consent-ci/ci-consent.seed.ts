import { ClinicSpecialty, Prisma, PrismaClient } from '@prisma/client';
import { CI_CONSENT_SPECS } from './ci-consent.specs';
import { CiConsentCode } from './ci-consent.types';
import { CI_GENERAL_HTML, CI_GENERAL_TITLE } from './texts/ci-general.text';
import {
  CI_ORAL_SURGERY_HTML,
  CI_ORAL_SURGERY_TITLE,
} from './texts/ci-oral-surgery.text';
import {
  CI_ORTHODONTICS_HTML,
  CI_ORTHODONTICS_TITLE,
} from './texts/ci-orthodontics.text';

const CI_TEXTS: Record<CiConsentCode, { title: string; bodyHtml: string }> = {
  'CI-OD-001': { title: CI_GENERAL_TITLE, bodyHtml: CI_GENERAL_HTML },
  'CI-ORT-002': { title: CI_ORTHODONTICS_TITLE, bodyHtml: CI_ORTHODONTICS_HTML },
  'CI-CIR-003': { title: CI_ORAL_SURGERY_TITLE, bodyHtml: CI_ORAL_SURGERY_HTML },
};

const CI_SPECIALTIES = [ClinicSpecialty.DENTISTRY, ClinicSpecialty.ORTHODONTICS];

type ConsentTemplateClient = Pick<PrismaClient, 'consentTemplate'>;

/** Upsert idempotente de las plantillas CI (versión 1, globales). */
export async function seedCiConsents(prisma: ConsentTemplateClient) {
  let upserted = 0;
  for (const specialty of CI_SPECIALTIES) {
    for (const code of Object.keys(CI_TEXTS) as CiConsentCode[]) {
      const { title, bodyHtml } = CI_TEXTS[code];
      const bodyJson = CI_CONSENT_SPECS[code] as unknown as Prisma.InputJsonValue;
      await prisma.consentTemplate.upsert({
        where: { specialty_code_version: { specialty, code, version: 1 } },
        create: {
          specialty,
          code,
          title,
          bodyHtml,
          bodyJson,
          version: 1,
          isActive: true,
          clinicId: null,
        },
        update: { title, bodyHtml, bodyJson, isActive: true },
      });
      upserted += 1;
    }
  }
  return upserted;
}
