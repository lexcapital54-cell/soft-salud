import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, PDFTextField, StandardFonts, rgb } from 'pdf-lib';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { PrismaService } from '../../prisma/prisma.module';

export type DocumentBrand = {
  clinicName: string;
  professionalName: string;
  professionalCard: string | null;
};

const BRAND_SUBJECT = 'HABILISALUD-BRANDED';
const FILLED_SUBJECT = 'HABILISALUD-FILLED';

const NAVY = rgb(0, 0.18, 0.36);
const TEAL = rgb(0.05, 0.45, 0.47);
const WHITE = rgb(1, 1, 1);

@Injectable()
export class PdfBrandService {
  private readonly logger = new Logger(PdfBrandService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveBrand(user: User, clinicId: string): Promise<DocumentBrand> {
    const clinic = await this.prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { name: true },
    });

    if (user.role === UserRole.SUPER_ADMIN) {
      const professional = await this.prisma.user.findFirst({
        where: {
          clinicId,
          isActive: true,
          role: { in: [UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL] },
        },
        orderBy: { createdAt: 'asc' },
        select: { fullName: true, professionalCard: true },
      });
      return {
        clinicName: clinic?.name ?? 'Consultorio',
        professionalName: professional?.fullName ?? user.fullName,
        professionalCard: professional?.professionalCard ?? null,
      };
    }

    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true, professionalCard: true },
    });
    return {
      clinicName: clinic?.name ?? user.clinic?.name ?? 'Consultorio',
      professionalName: row?.fullName ?? user.fullName,
      professionalCard: row?.professionalCard ?? user.professionalCard ?? null,
    };
  }

  bannerHtml(brand: DocumentBrand): string {
    const card = brand.professionalCard
      ? ` · TP ${this.escape(brand.professionalCard)}`
      : '';
    const initials = this.initials(brand.clinicName);
    return `<div style="font-family:Arial,Helvetica,sans-serif;background:#002d5c;color:#fff;padding:12px 16px;margin:0 0 20px;display:flex;gap:14px;align-items:center">
  <div style="width:42px;height:42px;border-radius:10px;background:#0d7377;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;letter-spacing:.04em">${this.escape(initials)}</div>
  <div>
    <div style="font-size:11px;letter-spacing:.12em;opacity:.85">HABILISALUD</div>
    <div style="font-size:16px;font-weight:700">${this.escape(brand.clinicName)}</div>
    <div style="font-size:13px">${this.escape(brand.professionalName)}${card}</div>
  </div>
</div>`;
  }

  fillProfessionalPlaceholders(
    html: string,
    brand: DocumentBrand,
  ): string {
    const name = this.escape(brand.professionalName);
    const clinic = this.escape(brand.clinicName);
    const card = this.escape(brand.professionalCard || '');
    let out = html;
    const pairs: Array<[RegExp, string]> = [
      [/\{\{\s*profesional\s*\}\}/gi, name],
      [/\{\{\s*nombre_profesional\s*\}\}/gi, name],
      [/\{\{\s*consultorio\s*\}\}/gi, clinic],
      [/\{\{\s*tarjeta\s*\}\}/gi, card],
      [/\[nombre del profesional\]/gi, name],
      [/\[consultorio\]/gi, clinic],
    ];
    for (const [pattern, value] of pairs) {
      out = out.replace(pattern, value);
    }
    out = out.replace(
      /(Elabor[oó]|Revis[oó]|Aprob[oó]|Profesional responsable|Nombre del profesional|Psic[oó]log[oa])([^<]{0,48})(_{5,}|…{3,})/gi,
      `$1$2${name}`,
    );
    return out;
  }

  async brandPdf(buffer: Buffer, brand: DocumentBrand): Promise<Buffer> {
    try {
      const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const subject = pdf.getSubject();
      if (subject === BRAND_SUBJECT || subject === FILLED_SUBJECT) {
        return buffer;
      }

      await this.fillKnownFields(pdf, brand);

      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const regular = await pdf.embedFont(StandardFonts.Helvetica);
      const initials = this.initials(brand.clinicName);
      const card = brand.professionalCard
        ? `TP ${brand.professionalCard}`
        : 'Profesional responsable';

      for (const page of pdf.getPages()) {
        const { width, height } = page.getSize();
        const boxWidth = Math.min(248, width - 24);
        const boxX = width - boxWidth - 12;
        const boxY = height - 44;

        page.drawRectangle({
          x: boxX,
          y: boxY,
          width: boxWidth,
          height: 32,
          color: NAVY,
        });
        page.drawRectangle({
          x: boxX + 6,
          y: boxY + 6,
          width: 20,
          height: 20,
          color: TEAL,
        });
        page.drawText(initials, {
          x: boxX + (initials.length > 2 ? 7.5 : 9.5),
          y: boxY + 12,
          size: 7,
          font: bold,
          color: WHITE,
        });
        page.drawText(this.clip(brand.clinicName, 34), {
          x: boxX + 32,
          y: boxY + 18,
          size: 7.5,
          font: bold,
          color: WHITE,
        });
        page.drawText(
          this.clip(`${brand.professionalName} · ${card}`, 38),
          {
            x: boxX + 32,
            y: boxY + 8,
            size: 6.5,
            font: regular,
            color: WHITE,
          },
        );
      }

      pdf.setSubject(BRAND_SUBJECT);
      pdf.setProducer('HABILISALUD');
      return Buffer.from(await pdf.save());
    } catch (error) {
      this.logger.warn(
        `No se pudo sellar el PDF: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return buffer;
    }
  }

  private async fillKnownFields(pdf: PDFDocument, brand: DocumentBrand) {
    try {
      const form = pdf.getForm();
      const fields = form.getFields();
      if (!fields.length) return;

      const nameHints =
        /nombre|profesional|elabor|revis|aprob|responsable|psicolog|firmante|quien elabor/i;
      const clinicHints = /consultorio|clinica|instituci|razon social|empresa/i;
      const cardHints = /tarjeta|tp\b|registro profesional/i;

      for (const field of fields) {
        if (!(field instanceof PDFTextField)) continue;
        const rawName = field.getName();
        const current = (field.getText() || '').trim();
        if (current) continue;
        if (nameHints.test(rawName)) {
          field.setText(brand.professionalName);
        } else if (clinicHints.test(rawName)) {
          field.setText(brand.clinicName);
        } else if (cardHints.test(rawName) && brand.professionalCard) {
          field.setText(brand.professionalCard);
        }
      }
    } catch {
      // PDF sin AcroForm o cifrado: el sello visual basta.
    }
  }

  private initials(name: string) {
    const parts = name
      .replace(/^(dra?|lic|psic)\.?\s+/i, '')
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return 'HS';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  private clip(value: string, max: number) {
    const clean = value.replace(/\s+/g, ' ').trim();
    return clean.length <= max ? clean : `${clean.slice(0, max - 1)}...`;
  }

  private escape(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

