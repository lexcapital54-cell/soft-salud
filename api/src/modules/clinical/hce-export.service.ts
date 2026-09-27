import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { PrismaService } from '../../prisma/prisma.module';
import { SearchHceExportQueryDto } from './dto/hce-export.dto';
import { HcePdfService, PatientSignatureInfo } from './hce-pdf.service';
import { PassThrough } from 'stream';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const createArchive = require('archiver') as (
  format: string,
  opts?: object,
) => import('archiver').Archiver;

const exportInclude = {
  patient: true,
  professional: {
    select: {
      id: true,
      fullName: true,
      professionalCard: true,
      email: true,
    },
  },
  clinicalRecord: {
    include: {
      evolutions: {
        orderBy: [
          { clinicalAttentionDate: 'asc' as const },
          { signedAt: 'asc' as const },
        ] as Array<Record<string, 'asc'>>,
        include: {
          author: {
            select: { fullName: true, professionalCard: true },
          },
        },
      },
    },
  },
  diagnoses: { orderBy: { createdAt: 'asc' as const } },
  procedures: { orderBy: { createdAt: 'asc' as const } },
} as const;

@Injectable()
export class HceExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: HcePdfService,
  ) {}

  private requireClinicId(user: User) {
    if (!user.clinicId) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    return user.clinicId;
  }

  /** Listado de historias exportables (sin filtro de mes). */
  async search(user: User, query: SearchHceExportQueryDto = {}) {
    const clinicId = this.requireClinicId(user);
    const q = query.q?.trim();

    const rows = await this.prisma.encounter.findMany({
      where: {
        clinicId,
        clinicalRecord: { isNot: null },
        ...(user.role === UserRole.HEALTH_PROFESSIONAL
          ? { professionalId: user.id }
          : {}),
        ...(q
          ? {
              patient: {
                OR: [
                  { documentNumber: { contains: q, mode: 'insensitive' } },
                  { firstName: { contains: q, mode: 'insensitive' } },
                  { lastName: { contains: q, mode: 'insensitive' } },
                  { secondLastName: { contains: q, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            secondLastName: true,
            documentType: true,
            documentNumber: true,
          },
        },
        clinicalRecord: {
          select: {
            id: true,
            status: true,
            signedAt: true,
            createdAt: true,
            noteFormat: true,
          },
        },
        professional: { select: { fullName: true } },
      },
      orderBy: [{ patient: { lastName: 'asc' } }, { createdAt: 'desc' }],
      take: 500,
    });

    return rows.map((row) => {
      const name = [row.patient.firstName, row.patient.lastName, row.patient.secondLastName]
        .filter(Boolean)
        .join(' ');
      return {
        encounterId: row.id,
        patientId: row.patient.id,
        patientName: name,
        documentType: row.patient.documentType,
        documentNumber: row.patient.documentNumber,
        externalCode: row.externalCode,
        status: row.clinicalRecord?.status ?? 'DRAFT',
        signedAt: row.clinicalRecord?.signedAt?.toISOString() ?? null,
        createdAt: row.clinicalRecord?.createdAt.toISOString() ?? row.createdAt.toISOString(),
        noteFormat: row.clinicalRecord?.noteFormat ?? 'FULL',
        professionalName: row.professional.fullName,
        fileName: this.pdf.suggestedFileName(row as never),
      };
    });
  }

  async pdfBuffer(user: User, encounterId: string) {
    const encounter = await this.loadEncounter(user, encounterId);
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: encounter.clinicId },
      select: { name: true, address: true, phone: true, specialty: true },
    });
    const buffer = await this.pdf.buildPdfBuffer(
      encounter as never,
      {
        name: clinic?.name ?? 'Consultorio',
        address: clinic?.address,
        phone: clinic?.phone,
        specialty: clinic?.specialty,
      },
      await this.patientSignatureFor(encounter),
    );
    return {
      buffer,
      fileName: this.pdf.suggestedFileName(encounter as never),
    };
  }

  async bulkZipStream(user: User, query: SearchHceExportQueryDto = {}) {
    const items = await this.search(user, query);
    const pass = new PassThrough();
    const archive = createArchive('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => pass.emit('error', err));
    archive.pipe(pass);

    void (async () => {
      for (const item of items) {
        try {
          const { buffer, fileName } = await this.pdfBuffer(user, item.encounterId);
          archive.append(buffer, { name: fileName });
        } catch {
          /* omitir filas con error */
        }
      }
      await archive.finalize();
    })();

    return pass;
  }

  /** Firma guardada en la HC o, si falta, la del último consentimiento sellado del paciente. */
  private async patientSignatureFor(encounter: {
    id: string;
    clinicId: string;
    patientId: string;
    clinicalRecord: { content: unknown } | null;
  }): Promise<PatientSignatureInfo | null> {
    const content = (encounter.clinicalRecord?.content ?? {}) as {
      consentDraft?: { patientSignatureBase64?: string | null };
    };
    const consent = await this.prisma.patientConsent.findFirst({
      where: {
        clinicId: encounter.clinicId,
        patientId: encounter.patientId,
        OR: [{ encounterId: encounter.id }, { encounterId: null }],
      },
      orderBy: { signedAt: 'desc' },
      select: { signatureBase64: true, signerName: true, signerRole: true, signedAt: true },
    });
    const image = content.consentDraft?.patientSignatureBase64 || consent?.signatureBase64;
    if (!image) return null;
    return {
      image,
      signerName: consent?.signerName,
      signerRole: consent?.signerRole,
      signedAt: consent?.signedAt,
    };
  }

  private async loadEncounter(user: User, encounterId: string) {
    const clinicId = this.requireClinicId(user);
    const encounter = await this.prisma.encounter.findFirst({
      where: {
        id: encounterId,
        clinicId,
        clinicalRecord: { isNot: null },
        ...(user.role === UserRole.HEALTH_PROFESSIONAL
          ? { professionalId: user.id }
          : {}),
      },
      include: exportInclude,
    });
    if (!encounter) {
      throw new NotFoundException('Historia clínica no encontrada');
    }
    if (user.role === UserRole.AUDITOR) {
      throw new ForbiddenException('Su rol no permite descargar el cuerpo clínico en PDF');
    }
    return encounter;
  }
}
