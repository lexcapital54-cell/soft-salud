import { BadRequestException, ForbiddenException, Injectable, NotFoundException, StreamableFile } from '@nestjs/common';
import { AuditAction, ClinicLogoKind, ClinicSpecialty, Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.module';
import { User } from '../../users/user.entity';
import { ClinicLogosService } from '../../clinics/clinic-logos.service';
import { PsychReportData, RenderPsychReportDto, SavePsychReportDto } from './psych-report.dto';
import { renderPsychReportPdf } from './psych-report-pdf';

type AuditContext = { ipAddress?: string; userAgent?: string };

const ENTITY = 'PsychReport';
const TZ = 'America/Bogota';
export const PSYCH_SIGNATURE_MAX_BYTES = 600 * 1024;

const SIGNATURE_TYPES: Array<{ mime: string; bytes: number[] }> = [
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
];

const DOCUMENT_TYPES: Record<string, string> = {
  CC: 'Cédula de ciudadanía',
  TI: 'Tarjeta de identidad',
  RC: 'Registro civil',
  CE: 'Cédula de extranjería',
  PA: 'Pasaporte',
  PT: 'Permiso por protección temporal',
  PPT: 'Permiso por protección temporal',
  PE: 'Permiso especial de permanencia',
  CN: 'Certificado de nacido vivo',
  MS: 'Menor sin identificación',
  AS: 'Adulto sin identificación',
};

const dateKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Edad cumplida a la fecha indicada (AAAA-MM-DD): «N años» o, en menores de un año, «N meses». */
export function ageAt(birth: string, at: string): string {
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth || '');
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(at || '');
  if (!b || !a) return '';
  let months = (Number(a[1]) - Number(b[1])) * 12 + (Number(a[2]) - Number(b[2]));
  if (Number(a[3]) < Number(b[3])) months -= 1;
  if (months < 0) return '';
  if (months < 12) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? 'año' : 'años'}`;
}

const personKey = (v: string) =>
  (v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(dra?|ps|psic|lic)\.?\s+/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const samePerson = (a: string, b: string) => !!personKey(a) && personKey(a) === personKey(b);

const emptyData = (clinicName: string): PsychReportData => ({
  clinicName,
  reportNumber: '',
  issuedAt: '',
  patient: { fullName: '', documentType: '', documentNumber: '', age: '', birthDate: '', phone: '', institution: '' },
  reason: '',
  findings: '',
  conclusions: '',
  professional: { fullName: '', title: '', card: '' },
});

@Injectable()
export class PsychReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logos: ClinicLogosService,
  ) {}

  /** Solo consultorios de psicología, siempre dentro del consultorio del usuario. */
  private async clinicOf(user: User) {
    if (!user.clinicId) throw new ForbiddenException('Su usuario no tiene consultorio asignado.');
    const clinic = await this.prisma.clinic.findUnique({ where: { id: user.clinicId }, select: { id: true, name: true, specialty: true } });
    if (!clinic) throw new NotFoundException('Consultorio no encontrado.');
    if (clinic.specialty !== ClinicSpecialty.PSYCHOLOGY) {
      throw new ForbiddenException('El informe psicológico está disponible solo para consultorios de psicología.');
    }
    return clinic;
  }

  /** El formulario multipart trae los datos como texto JSON; se validan con las mismas reglas del DTO. */
  async parsePayload<T extends object>(cls: new () => T, payload: string | undefined): Promise<T> {
    let raw: unknown;
    try {
      raw = JSON.parse(payload || '');
    } catch {
      throw new BadRequestException('Los datos del informe no son válidos.');
    }
    const dto = plainToInstance(cls, raw);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) throw new BadRequestException('Revise los datos del informe: hay campos con formato inválido o demasiado extensos.');
    return dto;
  }

  private checkSignature(file?: Express.Multer.File) {
    if (!file?.buffer?.length) return null;
    if (file.buffer.length > PSYCH_SIGNATURE_MAX_BYTES) throw new BadRequestException('La imagen de la firma no puede pesar más de 600 KB.');
    const mime = SIGNATURE_TYPES.find((s) => s.bytes.every((b, i) => file.buffer[i] === b))?.mime;
    if (!mime) throw new BadRequestException('La firma debe ser una imagen PNG o JPG.');
    return { data: new Uint8Array(file.buffer), mime };
  }

  async searchPatients(user: User, q?: string) {
    const clinic = await this.clinicOf(user);
    const term = (q || '').trim();
    if (term.length < 2) return [];
    const words = term.split(/\s+/).slice(0, 4);
    const rows = await this.prisma.patient.findMany({
      where: {
        clinicId: clinic.id,
        AND: words.map((w) => ({
          OR: [
            { firstName: { contains: w, mode: 'insensitive' as const } },
            { middleName: { contains: w, mode: 'insensitive' as const } },
            { lastName: { contains: w, mode: 'insensitive' as const } },
            { secondLastName: { contains: w, mode: 'insensitive' as const } },
            { documentNumber: { contains: w } },
          ],
        })),
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: 15,
      select: { id: true, firstName: true, middleName: true, lastName: true, secondLastName: true, documentType: true, documentNumber: true },
    });
    return rows.map((p) => ({
      id: p.id,
      fullName: [p.firstName, p.middleName, p.lastName, p.secondLastName].filter(Boolean).join(' '),
      document: [p.documentType, p.documentNumber].filter(Boolean).join(' '),
    }));
  }

  /** Datos del profesional según su perfil (nombre, título, tarjeta y firma registrada). */
  private async profileOf(user: User) {
    const me = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true, professionalTitle: true, professionalCard: true, professionalSignatureBase64: true },
    });
    const sig = me?.professionalSignatureBase64 || null;
    return {
      fullName: (me?.fullName || user.fullName || '').trim(),
      title: (me?.professionalTitle || '').trim(),
      card: (me?.professionalCard || '').trim(),
      signature: sig && /^data:image\/(png|jpeg);base64,/.test(sig) ? sig : null,
    };
  }

  /** Plantilla vacía: nombre del consultorio y datos del profesional que la diligencia. */
  async blank(user: User) {
    const clinic = await this.clinicOf(user);
    const pro = await this.profileOf(user);
    const data = emptyData(clinic.name);
    data.professional = { fullName: pro.fullName, title: pro.title, card: pro.card };
    return { patientId: null, data };
  }

  /** Identificación real del paciente y datos del profesional que diligencia (no se guarda nada). */
  async prefill(user: User, patientId: string) {
    const clinic = await this.clinicOf(user);
    const [patient, pro, count] = await Promise.all([
      this.prisma.patient.findFirst({ where: { id: patientId, clinicId: clinic.id } }),
      this.profileOf(user),
      this.prisma.psychReport.count({ where: { clinicId: clinic.id, createdAt: { gte: new Date(`${dateKey(new Date()).slice(0, 4)}-01-01T05:00:00Z`) } } }),
    ]);
    if (!patient) throw new NotFoundException('Paciente no encontrado en este consultorio.');
    const today = dateKey(new Date());
    // Fecha de nacimiento: columna DATE (sin hora), se toma tal cual.
    const birth = patient.birthDate ? patient.birthDate.toISOString().slice(0, 10) : '';
    const docType = (patient.documentType || '').trim().toUpperCase();
    const data = emptyData(clinic.name);
    data.reportNumber = `IP-${today.slice(0, 4)}-${String(count + 1).padStart(4, '0')}`;
    data.issuedAt = today;
    data.patient = {
      fullName: [patient.firstName, patient.middleName, patient.lastName, patient.secondLastName].filter(Boolean).join(' '),
      documentType: DOCUMENT_TYPES[docType] || patient.documentType || '',
      documentNumber: patient.documentNumber || '',
      age: ageAt(birth, today),
      birthDate: birth,
      phone: patient.phone || '',
      institution: '',
    };
    data.professional = { fullName: pro.fullName, title: pro.title, card: pro.card };
    return { patientId: patient.id, data };
  }

  async list(user: User, patientId?: string) {
    const clinic = await this.clinicOf(user);
    return this.prisma.psychReport.findMany({
      where: { clinicId: clinic.id, ...(patientId ? { patientId } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { id: true, patientId: true, patientName: true, reportNumber: true, createdAt: true, updatedAt: true },
    });
  }

  async get(user: User, id: string) {
    const clinic = await this.clinicOf(user);
    const row = await this.prisma.psychReport.findFirst({
      where: { id, clinicId: clinic.id },
      select: { id: true, patientId: true, patientName: true, reportNumber: true, data: true, signatureMime: true, createdAt: true, updatedAt: true },
    });
    if (!row) throw new NotFoundException('Informe no encontrado.');
    const { signatureMime, ...rest } = row;
    return { ...rest, hasSignature: !!signatureMime };
  }

  async signature(user: User, id: string) {
    const clinic = await this.clinicOf(user);
    const row = await this.prisma.psychReport.findFirst({ where: { id, clinicId: clinic.id }, select: { signatureData: true, signatureMime: true } });
    if (!row?.signatureData || !row.signatureMime) throw new NotFoundException('El informe no tiene firma cargada.');
    return new StreamableFile(Buffer.from(row.signatureData), { type: row.signatureMime });
  }

  /** Firma registrada en el perfil del profesional que tiene la sesión. */
  async mySignature(user: User) {
    return { dataUrl: (await this.profileOf(user)).signature };
  }

  async create(user: User, dto: SavePsychReportDto, file: Express.Multer.File | undefined, ctx: AuditContext) {
    const clinic = await this.clinicOf(user);
    const patientId = await this.checkPatient(clinic.id, dto.patientId);
    const name = this.requireName(dto.data);
    const sig = this.checkSignature(file);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.psychReport.create({
        data: {
          clinicId: clinic.id,
          patientId,
          patientName: name,
          reportNumber: (dto.data.reportNumber || '').trim(),
          data: dto.data as unknown as Prisma.InputJsonValue,
          signatureData: sig?.data ?? null,
          signatureMime: sig?.mime ?? null,
          createdById: user.id,
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: { clinicId: clinic.id, userId: user.id, action: AuditAction.CREATE, entityType: ENTITY, entityId: created.id, ...ctx, metadata: { patientId, signature: !!sig } },
      });
      return created.id;
    }).then((id) => this.get(user, id));
  }

  async update(user: User, id: string, dto: SavePsychReportDto, file: Express.Multer.File | undefined, ctx: AuditContext) {
    const clinic = await this.clinicOf(user);
    const existing = await this.prisma.psychReport.findFirst({ where: { id, clinicId: clinic.id }, select: { id: true, patientId: true } });
    if (!existing) throw new NotFoundException('Informe no encontrado.');
    const patientId = dto.patientId === undefined ? existing.patientId : await this.checkPatient(clinic.id, dto.patientId);
    const name = this.requireName(dto.data);
    const sig = this.checkSignature(file);
    const signature = sig
      ? { signatureData: sig.data, signatureMime: sig.mime }
      : dto.removeSignature
        ? { signatureData: null, signatureMime: null }
        : {};
    await this.prisma.$transaction(async (tx) => {
      await tx.psychReport.update({
        where: { id },
        data: {
          patientId,
          patientName: name,
          reportNumber: (dto.data.reportNumber || '').trim(),
          data: dto.data as unknown as Prisma.InputJsonValue,
          updatedById: user.id,
          ...signature,
        },
      });
      await tx.auditLog.create({
        data: {
          clinicId: clinic.id,
          userId: user.id,
          action: AuditAction.UPDATE,
          entityType: ENTITY,
          entityId: id,
          ...ctx,
          metadata: { patientId, signature: sig ? 'replaced' : dto.removeSignature ? 'removed' : 'kept' },
        },
      });
    });
    return this.get(user, id);
  }

  async pdf(user: User, dto: RenderPsychReportDto, file: Express.Multer.File | undefined, ctx: AuditContext) {
    const clinic = await this.clinicOf(user);
    const sig = this.checkSignature(file);
    const logoRow = await this.logos.find(clinic.id, ClinicLogoKind.FORMS);
    const logo = logoRow ? `data:${logoRow.mimeType};base64,${Buffer.from(logoRow.data).toString('base64')}` : null;
    let signature = sig ? `data:${sig.mime};base64,${Buffer.from(sig.data).toString('base64')}` : null;
    // Lo que falte del profesional se completa con el perfil de quien genera el PDF, solo si el informe es suyo
    // (sin nombre o con su mismo nombre): nunca se pone la firma de un profesional en el informe de otro.
    const pro = await this.profileOf(user);
    const given = dto.data.professional;
    if (!given.fullName.trim() || samePerson(given.fullName, pro.fullName)) {
      dto.data.professional = { fullName: given.fullName.trim() || pro.fullName, title: given.title.trim() || pro.title, card: given.card.trim() || pro.card };
      if (!signature && !dto.withoutSignature) signature = pro.signature;
    }
    const buffer = await renderPsychReportPdf(dto.data, logo, signature);
    await this.prisma.auditLog.create({
      data: { clinicId: clinic.id, userId: user.id, action: AuditAction.EXPORT, entityType: ENTITY, ...ctx, metadata: { format: 'pdf' } },
    });
    const safe = (dto.data.patient.fullName || 'informe').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '_').slice(0, 60);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="Informe_psicologico_${safe}_${dto.data.issuedAt || dateKey(new Date())}.pdf"`,
    });
  }

  private requireName(data: PsychReportData) {
    const name = (data.patient.fullName || '').trim();
    if (!name) {
      throw new BadRequestException({ message: 'Escriba los nombres y apellidos del paciente antes de guardar.', fields: { 'patient.fullName': 'Escriba los nombres y apellidos.' } });
    }
    return name.slice(0, 160);
  }

  private async checkPatient(clinicId: string, patientId?: string | null) {
    if (!patientId) return null;
    const ok = await this.prisma.patient.count({ where: { id: patientId, clinicId } });
    if (!ok) throw new BadRequestException('El paciente no pertenece a este consultorio.');
    return patientId;
  }
}
