import { Injectable, Logger } from '@nestjs/common';
import {
  PDFDocument,
  PDFName,
  PDFTextField,
  StandardFonts,
  degrees,
  rgb,
  type PDFField,
  type PDFPage,
} from 'pdf-lib';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { PrismaService } from '../../prisma/prisma.module';

export type DocumentBrand = {
  clinicName: string;
  professionalName: string;
  /** Tarjeta profesional / código REPS del profesional. */
  professionalCard: string | null;
  /** Ciudad del consultorio (si se puede inferir). */
  city: string | null;
  /** Firma manuscrita del profesional (historia clínica), si existe. */
  signatureBase64?: string | null;
  professionalUserId?: string | null;
  /** Quién elaboró el documento (sello institucional). */
  elaboratedBy: string;
  /** Fecha de creación del consultorio (dd/MM/yyyy). */
  clinicCreatedAtLabel: string;
  /** ISO date for form fields that expect yyyy-mm-dd. */
  clinicCreatedAtIso: string;
};

const BRAND_SUBJECT = 'HABILISALUD-BRAND-V5';
const FILLED_SUBJECT = 'HABILISALUD-FILLED';

const ELABORATED_BY = 'HABILISALUD';

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
      select: { name: true, createdAt: true, address: true },
    });
    const createdAt = clinic?.createdAt ?? new Date();
    const clinicCreatedAtLabel = this.formatDateCo(createdAt);
    const clinicCreatedAtIso = this.formatDateIso(createdAt);
    const city = this.inferCity(clinic?.address ?? null, clinic?.name ?? null);

    /**
     * El aprobador es SIEMPRE del consultorio `clinicId`.
     * - Profesional/admin del consultorio: firma con su propio perfil.
     * - Superadmin operando un consultorio: usa el titular (ADMIN) de ese
     *   consultorio, nunca el de otro ni el nombre del superadmin.
     */
    let professional: {
      id: string;
      fullName: string;
      professionalCard: string | null;
      professionalSignatureBase64: string | null;
    } | null = null;

    if (
      user.role !== UserRole.SUPER_ADMIN &&
      user.clinicId &&
      user.clinicId === clinicId
    ) {
      const row = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          fullName: true,
          professionalCard: true,
          professionalSignatureBase64: true,
        },
      });
      professional = row;
    } else {
      const candidates = await this.prisma.user.findMany({
        where: {
          clinicId,
          isActive: true,
          role: { in: [UserRole.ADMIN, UserRole.HEALTH_PROFESSIONAL] },
        },
        select: {
          id: true,
          fullName: true,
          professionalCard: true,
          professionalSignatureBase64: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });
      // Preferir ADMIN titular; si hay firma en perfil, priorizarla dentro del rol.
      const admins = candidates.filter((c) => c.role === UserRole.ADMIN);
      const pros = candidates.filter(
        (c) => c.role === UserRole.HEALTH_PROFESSIONAL,
      );
      const pick = (list: typeof candidates) =>
        list.find((c) => !!c.professionalSignatureBase64) ?? list[0] ?? null;
      professional = pick(admins) ?? pick(pros);
    }

    const professionalName = (
      professional?.fullName ||
      clinic?.name ||
      'Profesional del consultorio'
    ).trim();

    return {
      clinicName: clinic?.name ?? 'Consultorio',
      professionalName,
      professionalCard: professional?.professionalCard?.trim() || null,
      city,
      signatureBase64: professional?.professionalSignatureBase64 ?? null,
      professionalUserId: professional?.id ?? null,
      elaboratedBy: ELABORATED_BY,
      clinicCreatedAtLabel,
      clinicCreatedAtIso,
    };
  }

  bannerHtml(brand: DocumentBrand): string {
    return `<div style="font-family:Arial,Helvetica,sans-serif;text-align:center;padding:16px 12px;margin:0 0 20px;border-bottom:1px solid #c5e4e4">
  <div style="font-size:11px;letter-spacing:.08em;color:#0d7377;margin-bottom:6px">Aprobó</div>
  <div style="font-size:16px;font-weight:700;color:#002d5c">${this.escape(brand.professionalName)}</div>
  ${
    brand.professionalCard
      ? `<div style="font-size:12px;color:#0d7377;margin-top:4px">TP ${this.escape(brand.professionalCard)}</div>`
      : ''
  }
</div>`;
  }

  fillProfessionalPlaceholders(
    html: string,
    brand: DocumentBrand,
  ): string {
    const name = this.escape(brand.professionalName);
    const clinic = this.escape(brand.clinicName);
    const card = this.escape(brand.professionalCard || '');
    const elaboro = this.escape(brand.elaboratedBy);
    const fecha = this.escape(brand.clinicCreatedAtLabel);
    let out = html;
    const pairs: Array<[RegExp, string]> = [
      [/\{\{\s*profesional\s*\}\}/gi, name],
      [/\{\{\s*nombre_profesional\s*\}\}/gi, name],
      [/\{\{\s*consultorio\s*\}\}/gi, clinic],
      [/\{\{\s*tarjeta\s*\}\}/gi, card],
      [/\{\{\s*elaboro\s*\}\}/gi, elaboro],
      [/\{\{\s*reviso\s*\}\}/gi, elaboro],
      [/\{\{\s*fecha\s*\}\}/gi, fecha],
      [/\[nombre del profesional\]/gi, name],
      [/\[consultorio\]/gi, clinic],
      [/\[quien aprob[oó]\]/gi, name],
      [/\[aprobado por\]/gi, name],
      [/\[elabor[oó]\]/gi, elaboro],
      [/\[revis[oó]\]/gi, elaboro],
      [/\[fecha\]/gi, fecha],
    ];
    for (const [pattern, value] of pairs) {
      out = out.replace(pattern, value);
    }
    // 1. Elaboró → HABILISALUD
    out = out.replace(
      /(Elabor[oó]|Elaborado por|Quien elabor[oó])([^<]{0,48})(_{5,}|…{3,}|_{3,})/gi,
      `$1$2${elaboro}`,
    );
    // 2. Revisó → HABILISALUD
    out = out.replace(
      /(Revis[oó]|Revisado por|Quien revis[oó])([^<]{0,48})(_{5,}|…{3,}|_{3,})/gi,
      `$1$2${elaboro}`,
    );
    // 3. Aprobó → profesional
    out = out.replace(
      /(Aprob[oó]|Aprobado por|Quien aprob[oó])([^<]{0,48})(_{5,}|…{3,}|_{3,})/gi,
      `$1$2${name}`,
    );
    // Otros nombres genéricos → profesional
    out = out.replace(
      /(Profesional responsable|Nombre del profesional|Psic[oó]log[oa])([^<]{0,48})(_{5,}|…{3,}|_{3,})/gi,
      `$1$2${name}`,
    );
    // Fechas en blanco
    out = out.replace(
      /(Fecha(?:\s+de\s+(?:elaboraci[oó]n|aprobaci[oó]n|emisi[oó]n|creaci[oó]n))?)([^<]{0,24})(_{5,}|…{3,}|\d{0}\s*\/\s*\/\s*)/gi,
      `$1$2${fecha}`,
    );
    // Sin imagen de firma: solo el nombre del aprobador.
    return out;
  }

  /**
   * Rellena campos (Elaboró / Aprobó / Fecha) y deja centrado solo el
   * aprobador (profesional), sin estampar firma imagen.
   * `force`: re-diligencia aunque el PDF ya haya sido sellado (p. ej. réplica
   * a otro profesional).
   */
  async brandPdf(
    buffer: Buffer,
    brand: DocumentBrand,
    opts?: { force?: boolean },
  ): Promise<Buffer> {
    try {
      const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const subject = pdf.getSubject() || '';
      if (
        !opts?.force &&
        (subject === FILLED_SUBJECT ||
          subject === BRAND_SUBJECT ||
          subject === 'HABILISALUD-BRAND-V4')
      ) {
        return buffer;
      }

      await this.fillKnownFields(pdf, brand, !!opts?.force);
      if (this.looksLikeBiomedActa(buffer)) {
        await this.fillBiomedActaBlanks(pdf, brand);
      } else {
        await this.stampCenteredApprover(pdf, brand, !!opts?.force);
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

  /**
   * Marca de agua de consulta: nombre del profesional y consultorio en diagonal
   * (muy tenue) y una línea al pie con quién y cuándo lo descargó. Se aplica a
   * la copia entregada; el archivo almacenado no cambia.
   */
  async watermarkPdf(
    buffer: Buffer,
    mark: { name: string; card: string | null; clinic: string; when: Date },
  ): Promise<Buffer | null> {
    try {
      const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const latin = (value: string) => value.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
      const name = latin(mark.name.trim()) || 'Profesional';
      const clinic = latin(mark.clinic.trim()) || 'Consultorio';
      const when = mark.when.toLocaleString('es-CO', {
        timeZone: 'America/Bogota',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const diagonal = `${name} · ${clinic}`;
      const footer =
        `Descargado por ${name}${mark.card ? ` · TP ${latin(mark.card)}` : ''} · ${clinic} · ${when} · ` +
        'Uso exclusivo de este consultorio';
      const gray = rgb(0.35, 0.4, 0.45);

      for (const page of pdf.getPages()) {
        const { width, height } = page.getSize();
        const size = 20;
        const stepX = bold.widthOfTextAtSize(diagonal, size) + 90;
        const stepY = 150;
        for (let y = -height; y < height * 2; y += stepY) {
          for (let x = -width; x < width * 2; x += stepX) {
            page.drawText(diagonal, {
              x,
              y,
              size,
              font: bold,
              color: gray,
              opacity: 0.06,
              rotate: degrees(35),
            });
          }
        }
        let footSize = 6.5;
        while (font.widthOfTextAtSize(footer, footSize) > width - 40 && footSize > 4.5) {
          footSize -= 0.25;
        }
        page.drawText(footer, {
          x: Math.max(20, (width - font.widthOfTextAtSize(footer, footSize)) / 2),
          y: 10,
          size: footSize,
          font,
          color: gray,
          opacity: 0.6,
        });
      }
      return Buffer.from(await pdf.save());
    } catch (error) {
      this.logger.warn(
        `No se pudo poner la marca de agua: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /** Detecta el acta de no aplicabilidad de equipos biomédicos (sin AcroForm). */
  private looksLikeBiomedActa(buffer: Buffer) {
    const hay = buffer.toString('latin1');
    return (
      /Acta de No Aplicabilidad de Equipos/i.test(hay) ||
      /ACTA_NO_APLICABILIDAD_BIOMEDICOS/i.test(hay) ||
      (/equipo biom.?dico/i.test(hay) && /NO APLICABILIDAD/i.test(hay))
    );
  }

  /**
   * Rellena líneas en blanco del acta biomédicos:
   * Fecha, Ciudad, Nombre, Tarjeta Profesional (código REPS / TP).
   */
  private async fillBiomedActaBlanks(pdf: PDFDocument, brand: DocumentBrand) {
    const pages = pdf.getPages();
    if (!pages.length) return;
    const page = pages[0];
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const size = 11;

    const writeOverLine = (
      x: number,
      y: number,
      width: number,
      text: string,
      useBold = false,
    ) => {
      const clean = text.replace(/\s+/g, ' ').trim();
      if (!clean) return;
      page.drawRectangle({
        x,
        y: y - 2,
        width,
        height: size + 4,
        color: WHITE,
        borderWidth: 0,
      });
      page.drawText(this.clip(clean, 56), {
        x,
        y,
        size,
        font: useBold ? bold : font,
        color: NAVY,
      });
    };

    // Coordenadas medidas sobre la plantilla (carta 612×792, origen abajo-izq).
    writeOverLine(140, 608, 280, brand.clinicCreatedAtLabel);
    writeOverLine(145, 568, 280, brand.city || brand.clinicName);
    writeOverLine(148, 157, 320, brand.professionalName, true);
    writeOverLine(
      205,
      108,
      260,
      brand.professionalCard ? String(brand.professionalCard) : '',
      true,
    );
  }

  /** Intenta sacar ciudad desde dirección o nombre del consultorio. */
  private inferCity(address: string | null, clinicName: string | null) {
    const fromAddr = (address || '').trim();
    if (fromAddr) {
      const parts = fromAddr
        .split(/[,|\-–]/)
        .map((p) => p.trim())
        .filter(Boolean);
      const last = parts[parts.length - 1] || '';
      if (
        last &&
        last.length >= 3 &&
        last.length <= 40 &&
        !/\d/.test(last) &&
        !/^calle|^carrera|^cra|^cl\b|^av\b|^diag/i.test(last)
      ) {
        return last;
      }
    }
    return null;
  }

  private async fillKnownFields(
    pdf: PDFDocument,
    brand: DocumentBrand,
    force = false,
  ) {
    try {
      const form = pdf.getForm();
      const fields = form.getFields();
      if (!fields.length) return;

      for (const field of fields) {
        if (!(field instanceof PDFTextField)) continue;
        const rawName = field.getName();
        const hay = this.normalize(rawName);
        const current = (field.getText() || '').trim();
        const canOverwrite =
          force ||
          !current ||
          /habilisalud|profesional|consultorio|nombre|aprobo|elaboro|____|xxxxx/i.test(
            current,
          );

        if (this.isElaboroField(hay) || this.isRevisoField(hay)) {
          if (canOverwrite) field.setText(brand.elaboratedBy);
          continue;
        }
        if (this.isAproboField(hay) || this.isFirmaAproboField(hay)) {
          if (canOverwrite) field.setText(brand.professionalName);
          continue;
        }
        if (this.isFechaField(hay)) {
          if (
            force ||
            !current ||
            /fecha|dd|mm|aaaa|____/i.test(current)
          ) {
            field.setText(brand.clinicCreatedAtLabel);
          }
          continue;
        }
        if (this.isClinicField(hay)) {
          if (canOverwrite) field.setText(brand.clinicName);
          continue;
        }
        if (this.isCardField(hay) && brand.professionalCard) {
          if (canOverwrite || !current) field.setText(brand.professionalCard);
          continue;
        }
        if (this.isCityField(hay) && brand.city) {
          if (canOverwrite || !current) field.setText(brand.city);
          continue;
        }
        if (this.isNameField(hay)) {
          // Nombres genéricos sin rol → profesional (aprobador)
          if (canOverwrite) field.setText(brand.professionalName);
        }
      }
    } catch {
      // PDF sin AcroForm o cifrado.
    }
  }

  /**
   * En documentos con Elaboró / Revisó / Aprobó:
   * 1 y 2 = HABILISALUD · 3 = profesional del consultorio (nunca mezclar).
   * Con `force` se limpia el rectángulo antes de reescribir (réplicas).
   */
  private async stampCenteredApprover(
    pdf: PDFDocument,
    brand: DocumentBrand,
    force = false,
  ) {
    const pages = pdf.getPages();
    if (!pages.length) return;

    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const habilisalud = brand.elaboratedBy || 'HABILISALUD';
    const name = this.clip(brand.professionalName, 48);
    const card = brand.professionalCard
      ? `TP ${this.clip(brand.professionalCard, 28)}`
      : null;

    const elaboroRects: Array<{
      page: PDFPage;
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];
    const revisoRects: typeof elaboroRects = [];
    const aproboRects: typeof elaboroRects = [];

    try {
      const form = pdf.getForm();
      for (const field of form.getFields()) {
        const hay = this.normalize(field.getName());
        const rects = this.fieldWidgetRects(pdf, field);
        if (this.isElaboroField(hay) || this.isFirmaElaboroField(hay)) {
          elaboroRects.push(...rects);
        } else if (this.isRevisoField(hay) || this.isFirmaRevisoField(hay)) {
          revisoRects.push(...rects);
        } else if (this.isAproboField(hay) || this.isFirmaAproboField(hay)) {
          aproboRects.push(...rects);
        }
      }
    } catch {
      /* sin formulario */
    }

    const wipe = (rect: (typeof elaboroRects)[0]) => {
      rect.page.drawRectangle({
        x: rect.x - 1,
        y: rect.y - 1,
        width: rect.width + 2,
        height: rect.height + 2,
        color: WHITE,
        borderWidth: 0,
      });
    };

    const drawCenteredInRect = (
      rect: (typeof elaboroRects)[0],
      text: string,
      sizeHint?: number,
      clearFirst = force,
    ) => {
      if (clearFirst) wipe(rect);
      const size = sizeHint ?? Math.min(11, Math.max(8, rect.height * 0.4));
      const textWidth = bold.widthOfTextAtSize(text, size);
      const x = rect.x + Math.max(0, (rect.width - textWidth) / 2);
      const y = rect.y + Math.max(4, (rect.height - size) / 2);
      rect.page.drawText(text, {
        x,
        y,
        size,
        font: bold,
        color: NAVY,
      });
    };

    for (const rect of elaboroRects) drawCenteredInRect(rect, habilisalud);
    for (const rect of revisoRects) drawCenteredInRect(rect, habilisalud);

    if (aproboRects.length) {
      for (const rect of aproboRects) {
        drawCenteredInRect(rect, name);
        if (card) {
          const cardSize = 7;
          const cardW = regular.widthOfTextAtSize(card, cardSize);
          rect.page.drawText(card, {
            x: rect.x + Math.max(0, (rect.width - cardW) / 2),
            y: Math.max(rect.y + 2, rect.y + 4),
            size: cardSize,
            font: regular,
            color: TEAL,
          });
        }
      }
      return;
    }

    // Sin widgets: bloque centrado en la última página (solo Aprobó = profesional).
    const page = pages[pages.length - 1];
    const { width } = page.getSize();
    const label = 'Aprobó';
    const labelSize = 9;
    const nameSize = 12;
    const labelW = bold.widthOfTextAtSize(label, labelSize);
    const nameW = bold.widthOfTextAtSize(name, nameSize);
    const y = 78;
    // Limpia la franja inferior para no mezclar nombres de otro profesional.
    page.drawRectangle({
      x: 40,
      y: y - 20,
      width: width - 80,
      height: 52,
      color: WHITE,
      borderWidth: 0,
    });
    page.drawText(label, {
      x: (width - labelW) / 2,
      y: y + 18,
      size: labelSize,
      font: regular,
      color: TEAL,
    });
    page.drawText(name, {
      x: (width - nameW) / 2,
      y,
      size: nameSize,
      font: bold,
      color: NAVY,
    });
    if (card) {
      const cardSize = 8;
      const cardW = regular.widthOfTextAtSize(card, cardSize);
      page.drawText(card, {
        x: (width - cardW) / 2,
        y: y - 14,
        size: cardSize,
        font: regular,
        color: TEAL,
      });
    }
  }

  private fieldWidgetRects(
    pdf: PDFDocument,
    field: PDFField,
  ): Array<{
    page: PDFPage;
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    const out: Array<{
      page: PDFPage;
      x: number;
      y: number;
      width: number;
      height: number;
    }> = [];
    try {
      const widgets = field.acroField.getWidgets();
      for (const widget of widgets) {
        const rect = widget.getRectangle();
        const pageRef = widget.dict.get(PDFName.of('P'));
        let page: PDFPage | undefined;
        if (pageRef) {
          page = pdf.getPages().find((p) => p.ref === pageRef);
        }
        if (!page) {
          page = pdf.getPages()[pdf.getPages().length - 1];
        }
        if (!page || !rect) continue;
        out.push({
          page,
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        });
      }
    } catch {
      /* widget ilegible */
    }
    return out;
  }

  private isElaboroField(hay: string) {
    return (
      /(^|[^a-z])elabor/.test(hay) ||
      /quien elabor/.test(hay) ||
      /elaborado por/.test(hay) ||
      /firma elabor/.test(hay)
    );
  }

  private isFirmaElaboroField(hay: string) {
    return /firma/.test(hay) && /elabor/.test(hay);
  }

  private isRevisoField(hay: string) {
    return (
      /(^|[^a-z])revis/.test(hay) ||
      /quien revis/.test(hay) ||
      /revisado por/.test(hay) ||
      /firma revis/.test(hay)
    );
  }

  private isFirmaRevisoField(hay: string) {
    return /firma/.test(hay) && /revis/.test(hay);
  }

  private isAproboField(hay: string) {
    return (
      /(^|[^a-z])aprob/.test(hay) ||
      /quien aprob/.test(hay) ||
      /aprobado por/.test(hay) ||
      /autoriz/.test(hay)
    );
  }

  private isFirmaAproboField(hay: string) {
    return (
      (/firma/.test(hay) && /aprob/.test(hay)) ||
      /firma.?profesional/.test(hay) ||
      /firma.?responsable/.test(hay) ||
      /^firma$/.test(hay) ||
      /signature/.test(hay)
    );
  }

  private isFechaField(hay: string) {
    return (
      /fecha/.test(hay) ||
      /^date$/.test(hay) ||
      /fecha.?elabor/.test(hay) ||
      /fecha.?aprob/.test(hay) ||
      /fecha.?emision/.test(hay)
    );
  }

  private isClinicField(hay: string) {
    return /consultorio|clinica|instituci|razon social|empresa/.test(hay);
  }

  private isCardField(hay: string) {
    return (
      /tarjeta|tp\b|registro profesional|codigo reps|c[oó]digo reps|reps\b/.test(
        hay,
      )
    );
  }

  private isCityField(hay: string) {
    return /ciudad|municipio|city/.test(hay);
  }

  private isNameField(hay: string) {
    // Sin elabor/revis/aprob (ya cubiertos arriba)
    if (this.isElaboroField(hay) || this.isRevisoField(hay) || this.isAproboField(hay)) {
      return false;
    }
    return /nombre|profesional|responsable|psicolog|firmante/.test(hay);
  }

  private normalize(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private formatDateCo(date: Date) {
    const d = date.getUTCDate().toString().padStart(2, '0');
    const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const y = date.getUTCFullYear();
    return `${d}/${m}/${y}`;
  }

  private formatDateIso(date: Date) {
    const d = date.getUTCDate().toString().padStart(2, '0');
    const m = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    const y = date.getUTCFullYear();
    return `${y}-${m}-${d}`;
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
