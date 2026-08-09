import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { AttachmentCategory } from '@prisma/client';
import { extname } from 'path';
import { User } from '../../users/user.entity';
import { PrismaService } from '../../prisma/prisma.module';
import { ClinicalStorageService } from './clinical-storage.service';
import { UploadAttachmentMetaDto } from './dto/attachment.dto';

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ClinicalStorageService,
  ) {}

  private requireClinicId(user: User) {
    if (!user.clinicId) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    return user.clinicId;
  }

  async listByEncounter(user: User, encounterId: string) {
    const clinicId = this.requireClinicId(user);
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, clinicId },
      select: { id: true },
    });
    if (!encounter) throw new NotFoundException('Encuentro no encontrado');

    return this.prisma.clinicalAttachment.findMany({
      where: { encounterId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upload(
    user: User,
    meta: UploadAttachmentMetaDto,
    file: Express.Multer.File,
  ) {
    const clinicId = this.requireClinicId(user);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Archivo requerido');
    }

    const encounter = await this.prisma.encounter.findFirst({
      where: { id: meta.encounterId, clinicId },
      include: { clinicalRecord: { select: { id: true } } },
    });
    if (!encounter) throw new NotFoundException('Encuentro no encontrado');

    const clinicalRecordId =
      meta.clinicalRecordId || encounter.clinicalRecord?.id || null;

    const safeExt = (extname(file.originalname) || '').slice(0, 12);
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`;
    const { storageKey } = await this.storage.writeBuffer(
      `encounters/${encounter.id}`,
      fileName,
      file.buffer,
    );

    return this.prisma.clinicalAttachment.create({
      data: {
        encounterId: encounter.id,
        clinicalRecordId,
        uploadedById: user.id,
        label: meta.label,
        category: meta.category ?? AttachmentCategory.OTHER,
        caption: meta.caption,
        notes: meta.notes,
        storageKey,
        mimeType: file.mimetype || 'application/octet-stream',
        sizeBytes: file.size,
      },
    });
  }

  async download(user: User, id: string) {
    const clinicId = this.requireClinicId(user);
    const attachment = await this.prisma.clinicalAttachment.findFirst({
      where: { id, encounter: { clinicId } },
    });
    if (!attachment) throw new NotFoundException('Adjunto no encontrado');

    const buffer = await this.storage.readBuffer(attachment.storageKey);
    return {
      file: new StreamableFile(buffer, {
        type: attachment.mimeType,
        disposition: `inline; filename="${attachment.label.replace(/"/g, '')}"`,
      }),
      mimeType: attachment.mimeType,
      label: attachment.label,
    };
  }

  async remove(user: User, id: string) {
    const clinicId = this.requireClinicId(user);
    const attachment = await this.prisma.clinicalAttachment.findFirst({
      where: { id, encounter: { clinicId } },
    });
    if (!attachment) throw new NotFoundException('Adjunto no encontrado');

    await this.prisma.clinicalAttachment.delete({ where: { id } });
    return { ok: true };
  }
}
