import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { User } from '../../users/user.entity';
import { PrismaService } from '../../prisma/prisma.module';

/**
 * Firma manuscrita del profesional (Ley 527 de 1999).
 * Se dibuja una vez, queda en el perfil y se reutiliza en HCE, recetas e incapacidades.
 */
@Injectable()
export class ProfessionalSignatureService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: User) {
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { professionalSignatureBase64: true, professionalCard: true },
    });
    return {
      signatureBase64: row?.professionalSignatureBase64 ?? null,
      professionalName: user.fullName,
      professionalCard: row?.professionalCard ?? user.professionalCard ?? null,
    };
  }

  async save(user: User, signatureBase64: string) {
    const value = this.assertDataUrl(signatureBase64);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { professionalSignatureBase64: value },
    });
    return this.get(user);
  }

  async remove(user: User) {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { professionalSignatureBase64: null },
    });
    return this.get(user);
  }

  /**
   * Devuelve la firma a estampar: la recién dibujada (que además queda guardada
   * en el perfil) o, si no se envió ninguna, la que el profesional ya tenía.
   */
  async resolve(user: User, provided?: string | null) {
    const drawn = (provided || '').trim();
    if (drawn) {
      const value = this.assertDataUrl(drawn);
      await this.prisma.user
        .update({
          where: { id: user.id },
          data: { professionalSignatureBase64: value },
        })
        .catch(() => undefined);
      return value;
    }

    const stored = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { professionalSignatureBase64: true },
    });
    if (!stored?.professionalSignatureBase64) {
      throw new BadRequestException(
        'Dibuje su firma en el panel "Firma digital" antes de firmar el documento.',
      );
    }
    return stored.professionalSignatureBase64;
  }

  /** Huella SHA-256 del documento; se guarda para detectar cualquier alteración posterior. */
  hash(parts: (string | number | null | undefined)[]) {
    return createHash('sha256').update(parts.map((p) => p ?? '').join('|')).digest('hex');
  }

  /** Código legible que el paciente puede citar para verificar el documento. */
  verificationCode(prefix: string, hash: string) {
    const raw = hash.slice(0, 12).toUpperCase();
    return `${prefix}-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  }

  private assertDataUrl(value: string) {
    if (!value.startsWith('data:image/')) {
      throw new BadRequestException(
        'La firma debe enviarse como imagen base64 (data:image/...).',
      );
    }
    if (value.length > 2_000_000) {
      throw new BadRequestException('La firma es demasiado pesada.');
    }
    return value;
  }
}
