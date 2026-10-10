import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PdfPrinter = require('pdfmake') as new (
  fonts: Record<string, unknown>,
) => {
  createPdfKitDocument: (doc: unknown) => NodeJS.EventEmitter & {
    on: (event: string, cb: (...args: unknown[]) => void) => void;
    end: () => void;
  };
};
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { PrismaService } from '../../prisma/prisma.module';
import { User } from '../../users/user.entity';
import { ClinicalStorageService } from './clinical-storage.service';
import { pickAesthetic } from './aesthetic-tracking.integrity';
import { PhotoReportPhoto, aestheticPhotoReportDoc, imageDataUrl } from './aesthetic-photo-report.pdf';

/** Tope de fotos por informe para mantener el PDF manejable. */
const MAX_PHOTOS = 60;

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');

@Injectable()
export class AestheticPhotoReportService {
  private readonly logger = new Logger(AestheticPhotoReportService.name);
  private readonly printer = new PdfPrinter({
    Helvetica: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' },
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ClinicalStorageService,
  ) {}

  async build(user: User, patientId: string, query: { angle?: string; before?: string; after?: string }) {
    const clinicId = user.clinicId;
    if (!clinicId) throw new ForbiddenException('Usuario sin consultorio asignado');
    const [clinic, patient, row] = await Promise.all([
      this.prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { name: true, specialty: true, nit: true, habilitationCode: true, address: true, phone: true },
      }),
      this.prisma.patient.findFirst({ where: { id: patientId, clinicId } }),
      this.prisma.aestheticTracking.findUnique({ where: { patientId } }),
    ]);
    if (clinic?.specialty !== 'AESTHETIC') {
      throw new ForbiddenException('El informe fotográfico solo está disponible en consultorios de medicina estética.');
    }
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    const data = row && row.clinicId === clinicId ? pickAesthetic(row.data) : pickAesthetic(null);
    const procTypes = new Map(data.procedures.map((p) => [str((p as Obj).id), str((p as Obj).type)]));
    let photos = data.photos.map((raw) => raw as Obj).filter((p) => str(p.attachmentId));
    if (query.angle) photos = photos.filter((p) => p.angle === query.angle);
    // El par del comparativo va primero para que no lo deje por fuera el tope.
    const pinned = new Set([query.before, query.after].filter(Boolean));
    photos = [...photos.filter((p) => pinned.has(str(p.id))), ...photos.filter((p) => !pinned.has(str(p.id)))].slice(0, MAX_PHOTOS);

    // Solo adjuntos de atenciones de este paciente en este consultorio.
    const attachments = await this.prisma.clinicalAttachment.findMany({
      where: { id: { in: photos.map((p) => str(p.attachmentId)) }, encounter: { patientId, clinicId } },
      select: { id: true, storageKey: true },
    });
    const keys = new Map(attachments.map((a) => [a.id, a.storageKey]));

    const items: PhotoReportPhoto[] = [];
    for (const p of photos) {
      const key = keys.get(str(p.attachmentId));
      if (!key) continue;
      let image: string | null = null;
      try {
        image = imageDataUrl(await this.storage.readBuffer(key));
      } catch (error) {
        this.logger.warn(`No se pudo leer la foto ${str(p.id)}: ${(error as Error).message}`);
      }
      items.push({
        id: str(p.id),
        angle: str(p.angle),
        moment: str(p.moment),
        date: str(p.date),
        note: str(p.note),
        procedureType: procTypes.get(str(p.procedureId)) || '',
        image,
      });
    }

    const name = [patient.firstName, patient.middleName, patient.lastName, patient.secondLastName].filter(Boolean).join(' ');
    const age = patient.birthDate ? Math.floor((Date.now() - patient.birthDate.getTime()) / (365.25 * 86_400_000)) : null;
    const compare = query.before && query.after ? { before: query.before, after: query.after } : null;
    const buffer = await this.render(
      aestheticPhotoReportDoc({
        provider: clinic,
        patient: { name, document: [patient.documentType, patient.documentNumber].filter(Boolean).join(' '), age },
        generatedBy: user.fullName || user.email,
        generatedAt: new Date(),
        photos: items,
        compare,
      }),
    );

    await this.prisma.auditLog.create({
      data: {
        clinicId,
        userId: user.id,
        action: 'EXPORT',
        entityType: 'AestheticPhotoReport',
        entityId: row?.id ?? patientId,
        metadata: { patientId, photos: items.map((p) => p.id), angle: query.angle || null, compare },
      },
    });

    const last = (patient.lastName || 'paciente').replace(/\s+/g, '_');
    const fileName = `Informe_fotografico_${last}_${patient.documentNumber || 'sin-doc'}.pdf`.replace(/[^\w.-]+/g, '_');
    return { buffer, fileName };
  }

  private render(doc: TDocumentDefinitions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const chunks: Buffer[] = [];
        const pdf = this.printer.createPdfKitDocument(doc);
        pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
        pdf.on('end', () => resolve(Buffer.concat(chunks)));
        pdf.on('error', (err: Error) => reject(err));
        pdf.end();
      } catch (error) {
        this.logger.error('Error generando el informe fotográfico', error);
        reject(error);
      }
    });
  }
}
