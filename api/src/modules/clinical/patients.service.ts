import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { User } from '../../users/user.entity';
import { PrismaService } from '../../prisma/prisma.module';
import { EmailSmtpProvider } from '../notifications/notification-providers';
import {
  CreatePatientDto,
  QuickPatientDto,
  UpdatePatientDto,
} from './dto/patient.dto';
import { withProfileStatus } from './patient-profile';
import { ClinicalStorageService } from './clinical-storage.service';

/** Basta con saber si existe una atención con historia abierta. */
const historyProbe = {
  encounters: {
    where: { clinicalRecord: { isNot: null } },
    select: { id: true },
    take: 1,
  },
} as const;

/**
 * Marca si el paciente ya tiene historia clínica: la recepción necesita saber,
 * al agendar, que la atención se registrará como nota de evolución.
 */
function withHistoryFlag<T extends { encounters: { id: string }[] }>(row: T) {
  const { encounters, ...patient } = row;
  return { ...patient, hasClinicalHistory: encounters.length > 0 };
}

@Injectable()
export class PatientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ClinicalStorageService,
    private readonly email: EmailSmtpProvider,
  ) {}

  private requireClinicId(user: User) {
    if (!user.clinicId) {
      throw new ForbiddenException('Usuario sin consultorio asignado');
    }
    return user.clinicId;
  }

  async list(user: User, q?: string, range: { from?: string; to?: string } = {}) {
    const clinicId = this.requireClinicId(user);
    const query = q?.trim();
    const createdAt = this.createdRange(range);
    const rows = await this.prisma.patient.findMany({
      where: {
        clinicId,
        ...(createdAt ? { createdAt } : {}),
        ...(query
          ? {
              OR: [
                { firstName: { contains: query, mode: 'insensitive' } },
                { lastName: { contains: query, mode: 'insensitive' } },
                { documentNumber: { contains: query, mode: 'insensitive' } },
                { phone: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: historyProbe,
      orderBy: createdAt
        ? [{ createdAt: 'desc' }]
        : [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: createdAt ? 500 : 200,
    });
    return rows.map((row) => withHistoryFlag(withProfileStatus(row)));
  }

  /** Rango YYYY-MM-DD sobre la fecha de registro, para el calendario. */
  private createdRange({ from, to }: { from?: string; to?: string }) {
    if (!from && !to) return null;
    const end = to ? new Date(`${to}T00:00:00`) : null;
    if (end) end.setDate(end.getDate() + 1);
    return {
      ...(from ? { gte: new Date(`${from}T00:00:00`) } : {}),
      ...(end ? { lt: end } : {}),
    };
  }

  /**
   * Alta exprés desde la agenda: se abre la ficha con lo indispensable para
   * agendar y contactar. El resto se completa cuando el paciente asiste.
   *
   * Sin documento no hay clave natural, así que la ficha provisional se
   * identifica por nombre + teléfono: si ya existe se reutiliza en vez de
   * duplicar al paciente y partir su historia clínica en dos.
   */
  async quickCreate(user: User, dto: QuickPatientDto) {
    const clinicId = this.requireClinicId(user);
    const firstName = dto.firstName.trim();
    const lastName = dto.lastName.trim();
    const phone = dto.phone.trim();

    const document = dto.documentNumber?.trim();
    const existing = await this.findByIdentity(
      clinicId,
      firstName,
      lastName,
      document,
    );
    if (existing) {
      return { ...withProfileStatus(withHistoryFlag(existing)), reused: true };
    }

    try {
      const patient = await this.prisma.patient.create({
        data: {
          clinicId,
          firstName,
          lastName,
          phone,
          email: dto.email?.trim() || null,
          documentType: document ? dto.documentType?.trim() || 'CC' : null,
          documentNumber: document || null,
        },
      });
      return {
        ...withProfileStatus(patient),
        hasClinicalHistory: false,
        reused: false,
      };
    } catch {
      // El índice único atrapó una doble pulsación o dos recepcionistas
      // registrando a la vez: devolvemos la ficha ganadora.
      const winner = await this.findByIdentity(
        clinicId,
        firstName,
        lastName,
        document,
      );
      if (winner) {
        return { ...withProfileStatus(withHistoryFlag(winner)), reused: true };
      }
      throw new BadRequestException('No se pudo registrar el paciente.');
    }
  }

  /**
   * Un paciente por persona: manda la cédula si viene, y si no el nombre
   * completo. Así una segunda cita nunca abre una ficha paralela ni parte la
   * historia clínica en dos.
   */
  private async findByIdentity(
    clinicId: string,
    firstName: string,
    lastName: string,
    documentNumber?: string,
  ) {
    const document = documentNumber?.replace(/\s/g, '');
    if (document) {
      const byDocument = await this.prisma.patient.findFirst({
        where: {
          clinicId,
          documentNumber: { equals: document, mode: 'insensitive' },
        },
        include: historyProbe,
      });
      if (byDocument) return byDocument;
    }

    return this.prisma.patient.findFirst({
      where: {
        clinicId,
        firstName: { equals: firstName, mode: 'insensitive' },
        lastName: { equals: lastName, mode: 'insensitive' },
      },
      include: historyProbe,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(user: User, dto: CreatePatientDto) {
    const clinicId = this.requireClinicId(user);
    try {
      const patient = await this.prisma.patient.create({
        data: {
          clinicId,
          documentType: dto.documentType,
          documentNumber: dto.documentNumber,
          firstName: dto.firstName,
          middleName: dto.middleName,
          lastName: dto.lastName,
          secondLastName: dto.secondLastName,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
          sexAtBirth: dto.sexAtBirth,
          genderIdentity: dto.genderIdentity,
          sexualOrientation: dto.sexualOrientation,
          maritalStatus: dto.maritalStatus,
          address: dto.address,
          city: dto.city,
          department: dto.department,
          municipalityCode: dto.municipalityCode,
          phone: dto.phone,
          email: dto.email,
          eps: dto.eps,
          regime: dto.regime,
          profession: dto.profession,
          occupation: dto.occupation,
          educationLevel: dto.educationLevel,
          emergencyContactName: dto.emergencyContactName,
          emergencyContactPhone: dto.emergencyContactPhone,
          emergencyRelationship: dto.emergencyRelationship,
          guardianFullName: dto.guardianFullName,
          guardianDocumentType: dto.guardianDocumentType,
          guardianDocumentNumber: dto.guardianDocumentNumber,
          guardianRelationship: dto.guardianRelationship,
          guardianPhone: dto.guardianPhone,
          guardianEmail: dto.guardianEmail,
          photoUrl: dto.photoUrl,
        },
      });
      return withProfileStatus(patient);
    } catch {
      throw new BadRequestException(
        'No se pudo crear el paciente. Verifique documento duplicado u otros datos.',
      );
    }
  }

  async update(user: User, id: string, dto: UpdatePatientDto) {
    const clinicId = this.requireClinicId(user);
    const existing = await this.prisma.patient.findFirst({ where: { id, clinicId } });
    if (!existing) {
      throw new NotFoundException('Paciente no encontrado');
    }

    const updated = await this.prisma.patient.update({
      where: { id },
      data: {
        ...(dto.documentType !== undefined ? { documentType: dto.documentType } : {}),
        ...(dto.documentNumber !== undefined
          ? { documentNumber: dto.documentNumber }
          : {}),
        ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
        ...(dto.middleName !== undefined ? { middleName: dto.middleName } : {}),
        ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
        ...(dto.secondLastName !== undefined
          ? { secondLastName: dto.secondLastName }
          : {}),
        ...(dto.birthDate !== undefined ? { birthDate: new Date(dto.birthDate) } : {}),
        ...(dto.sexAtBirth !== undefined ? { sexAtBirth: dto.sexAtBirth } : {}),
        ...(dto.genderIdentity !== undefined
          ? { genderIdentity: dto.genderIdentity }
          : {}),
        ...(dto.sexualOrientation !== undefined
          ? { sexualOrientation: dto.sexualOrientation }
          : {}),
        ...(dto.maritalStatus !== undefined ? { maritalStatus: dto.maritalStatus } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.city !== undefined ? { city: dto.city } : {}),
        ...(dto.department !== undefined ? { department: dto.department } : {}),
        ...(dto.municipalityCode !== undefined
          ? { municipalityCode: dto.municipalityCode }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.eps !== undefined ? { eps: dto.eps } : {}),
        ...(dto.regime !== undefined ? { regime: dto.regime } : {}),
        ...(dto.profession !== undefined ? { profession: dto.profession } : {}),
        ...(dto.occupation !== undefined ? { occupation: dto.occupation } : {}),
        ...(dto.educationLevel !== undefined
          ? { educationLevel: dto.educationLevel }
          : {}),
        ...(dto.emergencyContactName !== undefined
          ? { emergencyContactName: dto.emergencyContactName }
          : {}),
        ...(dto.emergencyContactPhone !== undefined
          ? { emergencyContactPhone: dto.emergencyContactPhone }
          : {}),
        ...(dto.emergencyRelationship !== undefined
          ? { emergencyRelationship: dto.emergencyRelationship }
          : {}),
        ...(dto.guardianFullName !== undefined
          ? { guardianFullName: dto.guardianFullName }
          : {}),
        ...(dto.guardianDocumentType !== undefined
          ? { guardianDocumentType: dto.guardianDocumentType }
          : {}),
        ...(dto.guardianDocumentNumber !== undefined
          ? { guardianDocumentNumber: dto.guardianDocumentNumber }
          : {}),
        ...(dto.guardianRelationship !== undefined
          ? { guardianRelationship: dto.guardianRelationship }
          : {}),
        ...(dto.guardianPhone !== undefined
          ? { guardianPhone: dto.guardianPhone }
          : {}),
        ...(dto.guardianEmail !== undefined
          ? { guardianEmail: dto.guardianEmail }
          : {}),
        ...(dto.photoUrl !== undefined ? { photoUrl: dto.photoUrl } : {}),
      },
    });
    return withProfileStatus(updated);
  }

  async getForClinic(user: User, id: string) {
    const clinicId = this.requireClinicId(user);
    const patient = await this.prisma.patient.findFirst({
      where: { id, clinicId },
      include: historyProbe,
    });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }
    return withProfileStatus(withHistoryFlag(patient));
  }

  /**
   * Envía el encuadre terapéutico (horarios, cancelaciones, confidencialidad)
   * al correo del paciente cuando hay SMTP; si no, queda registrado como simulado.
   */
  async sendTherapeuticFrame(user: User, patientId: string) {
    const clinicId = this.requireClinicId(user);
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId },
      include: { clinic: true },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    const destination = patient.email?.trim() || null;
    const patientName =
      `${patient.firstName || ''} ${patient.lastName || ''}`.replace(/\s+/g, ' ').trim() ||
      'paciente';
    const clinicName = patient.clinic?.name || 'el consultorio';
    const body = [
      `Estimado/a ${patientName},`,
      '',
      `Le compartimos las reglas terapéuticas de ${clinicName}:`,
      '',
      '1. Horarios: llegue a tiempo; la sesión inicia y termina en la hora agendada.',
      '2. Cancelaciones: avise con al menos 24 horas de anticipación para reprogramar.',
      '3. Confidencialidad: lo hablado en sesión es privado, salvo riesgo inminente o deber legal (Ley 1090 de 2006).',
      '4. Encuadre: el proceso requiere compromiso mutuo; si no puede continuar, comuníquelo a su profesional.',
      '5. Contacto: use los canales oficiales del consultorio para citas y dudas administrativas.',
      '',
      'Este mensaje es informativo y queda registrado en su expediente.',
      '',
      'HABILISALUD',
    ].join('\n');

    let simulated = true;
    let providerMessageId: string | undefined;
    if (destination) {
      const result = await this.email.send({
        destination,
        subject: `Reglas terapéuticas · ${clinicName}`,
        body,
      });
      simulated = result.simulated;
      providerMessageId = result.providerMessageId;
    }

    await this.prisma.auditLog.create({
      data: {
        clinicId,
        userId: user.id,
        action: 'CREATE',
        entityType: 'TherapeuticFrame',
        entityId: patient.id,
        metadata: {
          destination,
          simulated: !destination || simulated,
          providerMessageId,
          topics: [
            'horarios',
            'cancelaciones',
            'confidencialidad',
            'encuadre terapéutico',
          ],
        },
      },
    });

    if (!destination) {
      return {
        sent: false,
        destination: null,
        message:
          'El paciente no tiene correo. Agregue un email en la ficha para enviar las reglas terapéuticas.',
      };
    }

    return {
      sent: true,
      destination,
      simulated,
      message: simulated
        ? `Encuadre registrado para ${destination} (SMTP no configurado: modo simulado).`
        : `Reglas terapéuticas enviadas a ${destination}.`,
    };
  }

  /**
   * Plan / indicaciones odontológicas. Por correo se envía aquí; por WhatsApp el
   * mensaje sale desde el navegador y aquí solo queda la constancia.
   */
  async sendDentalInstructions(
    user: User,
    patientId: string,
    dto: { channel: 'EMAIL' | 'WHATSAPP'; title: string; message: string; encounterId?: string },
  ) {
    const clinicId = this.requireClinicId(user);
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId },
      include: { clinic: true },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    const clinicName = patient.clinic?.name || 'el consultorio';
    const destination =
      dto.channel === 'EMAIL' ? patient.email?.trim() || null : patient.phone?.trim() || null;
    if (!destination) {
      return {
        sent: false,
        destination: null,
        message:
          dto.channel === 'EMAIL'
            ? 'El paciente no tiene correo. Agréguelo en la ficha para enviar las indicaciones.'
            : 'El paciente no tiene teléfono registrado.',
      };
    }

    let simulated = false;
    let providerMessageId: string | undefined;
    if (dto.channel === 'EMAIL') {
      const result = await this.email.send({
        destination,
        subject: `${dto.title} · ${clinicName}`,
        body: `${dto.message.trim()}\n\n${clinicName}`,
      });
      simulated = result.simulated;
      providerMessageId = result.providerMessageId;
    }

    await this.prisma.auditLog.create({
      data: {
        clinicId,
        userId: user.id,
        action: 'CREATE',
        entityType: 'DentalInstructions',
        entityId: patient.id,
        metadata: {
          channel: dto.channel,
          title: dto.title,
          encounterId: dto.encounterId || null,
          destination,
          simulated,
          providerMessageId,
        },
      },
    });

    return {
      sent: true,
      destination,
      simulated,
      message:
        dto.channel === 'WHATSAPP'
          ? `Envío por WhatsApp registrado (${destination}).`
          : simulated
            ? `Indicaciones registradas para ${destination} (SMTP no configurado: modo simulado).`
            : `Indicaciones enviadas a ${destination}.`,
    };
  }

  /**
   * Foto de identificación del paciente: archivo en storage + clave en photoUrl.
   * Acepta cámara o galería (JPEG/PNG/WebP, máx. 8 MB).
   */
  async uploadPhoto(user: User, patientId: string, file: Express.Multer.File) {
    const clinicId = this.requireClinicId(user);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Seleccione o capture una foto.');
    }
    const mime = (file.mimetype || '').toLowerCase();
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mime)) {
      throw new BadRequestException('Solo se permiten imágenes JPG, PNG o WebP.');
    }

    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    const ext =
      mime.includes('png') ? '.png' : mime.includes('webp') ? '.webp' : '.jpg';
    const fileName = `avatar-${Date.now()}${ext}`;
    const { storageKey } = await this.storage.writeBuffer(
      `patients/${patient.id}`,
      fileName,
      file.buffer,
      mime,
    );

    const updated = await this.prisma.patient.update({
      where: { id: patient.id },
      data: { photoUrl: storageKey },
    });
    return withProfileStatus(updated);
  }

  async getPhoto(user: User, patientId: string) {
    const clinicId = this.requireClinicId(user);
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId },
      select: { id: true, photoUrl: true },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');
    if (!patient.photoUrl || this.isExternalPhoto(patient.photoUrl)) {
      throw new NotFoundException('El paciente no tiene foto cargada.');
    }

    const buffer = await this.storage.readBuffer(patient.photoUrl);
    const mime = this.guessImageMime(patient.photoUrl);
    return new StreamableFile(buffer, {
      type: mime,
      disposition: 'inline; filename="paciente-foto"',
    });
  }

  async removePhoto(user: User, patientId: string) {
    const clinicId = this.requireClinicId(user);
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, clinicId },
    });
    if (!patient) throw new NotFoundException('Paciente no encontrado');

    const updated = await this.prisma.patient.update({
      where: { id: patient.id },
      data: { photoUrl: null },
    });
    return withProfileStatus(updated);
  }

  /** URLs http(s) o data: legacy; lo demás se trata como storageKey. */
  isExternalPhoto(photoUrl: string) {
    return /^(https?:|data:)/i.test(photoUrl.trim());
  }

  private guessImageMime(storageKey: string) {
    const lower = storageKey.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }
}
