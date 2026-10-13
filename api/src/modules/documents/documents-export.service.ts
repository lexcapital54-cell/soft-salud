import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { AuditAction, DocumentFileStatus, DocumentPillar } from '@prisma/client';
import AdmZip from 'adm-zip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { PrismaService } from '../../prisma/prisma.module';
import { ClinicalStorageService } from '../clinical/clinical-storage.service';
import { UserRole } from '../../common/enums';
import { User } from '../../users/user.entity';
import { HabilitationRegistryService } from './habilitation-registry.service';
import { PdfBrandService } from './pdf-brand.service';

type AuditContext = { ipAddress?: string; userAgent?: string };
export type StandardExportFormat = 'zip' | 'pdf';

type ExportItem = {
  pillarLabel: string;
  categoryName: string;
  code: string;
  title: string;
  fileId: string;
  version: number;
  originalName: string;
  buffer: Buffer;
};

type Omitted = { title: string; originalName: string; reason: string };

const NAVY = rgb(0.06, 0.15, 0.28);
const GOLD = rgb(0.72, 0.57, 0.35);
const INK = rgb(0.08, 0.13, 0.2);
const MUTED = rgb(0.3, 0.36, 0.45);

function safeName(value: string, max = 80) {
  return (
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9._ -]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max) || 'documento'
  );
}

/** Solo caracteres que admite la fuente estándar del PDF (WinAnsi). */
function latin(value: string) {
  return value.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

function isPdf(mimeType: string, name: string) {
  return mimeType === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
}

/**
 * Descarga de la documentación por estándar: ZIP con un PDF por documento o un
 * único PDF unido. El consultorio recibe siempre copias con marca de agua de
 * quien descarga; los archivos almacenados no cambian.
 */
@Injectable()
export class DocumentsExportService {
  private readonly logger = new Logger(DocumentsExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ClinicalStorageService,
    private readonly registry: HabilitationRegistryService,
    private readonly pdfBrand: PdfBrandService,
  ) {}

  async exportStandard(
    user: User,
    format: StandardExportFormat,
    pillarParam: string | undefined,
    context: AuditContext,
    clinicIdParam?: string,
  ) {
    const isSuper = user.role === UserRole.SUPER_ADMIN;
    if (!isSuper && user.role !== UserRole.ADMIN && user.role !== UserRole.HEALTH_PROFESSIONAL) {
      throw new ForbiddenException('No tiene permiso para descargar documentos.');
    }
    if (format !== 'zip' && format !== 'pdf') {
      throw new BadRequestException('Formato no válido. Use zip o pdf.');
    }

    const data = await this.registry.registry(user, clinicIdParam);
    const clinicId = data.clinic.id;
    const pillar = pillarParam?.trim() || '';
    if (pillar && !data.pillars.some((p) => p.key === pillar)) {
      throw new NotFoundException('Estándar no disponible para este consultorio.');
    }
    const pillarLabel = pillar
      ? data.pillars.find((p) => p.key === pillar)?.label ?? pillar
      : 'Todos los estándares';

    const docs = data.documents.filter(
      (d) => d.isEnabled && d.state !== 'ARCHIVADO' && (!pillar || d.pillar === (pillar as DocumentPillar)),
    );
    const order = new Map(data.pillars.map((p, i) => [p.key as string, i]));
    docs.sort(
      (a, b) =>
        (order.get(a.pillar) ?? 99) - (order.get(b.pillar) ?? 99) ||
        a.categoryName.localeCompare(b.categoryName) ||
        a.code.localeCompare(b.code),
    );

    // Todas las versiones activas: un requisito puede agrupar varios documentos distintos.
    const files = await this.prisma.documentFile.findMany({
      where: {
        requirementId: { in: docs.map((d) => d.id) },
        status: { not: DocumentFileStatus.RETIRED },
      },
      orderBy: { version: 'desc' },
      select: { id: true, requirementId: true, version: true, originalName: true, mimeType: true, storageKey: true },
    });
    const byRequirement = new Map<string, typeof files>();
    for (const f of files) {
      const list = byRequirement.get(f.requirementId) ?? [];
      list.push(f);
      byRequirement.set(f.requirementId, list);
    }

    const brand = await this.pdfBrand.resolveBrand(user, clinicId);
    const me = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { fullName: true, professionalCard: true },
    });
    const when = new Date();
    const mark = {
      name: me?.fullName || user.fullName || 'Profesional',
      card: me?.professionalCard?.trim() || null,
      clinic: brand.clinicName,
      when,
    };

    const items: ExportItem[] = [];
    const omitted: Omitted[] = [];
    for (const doc of docs) {
      for (const file of byRequirement.get(doc.id) ?? []) {
        const pdf = isPdf(file.mimeType, file.originalName);
        if (!pdf && (!isSuper || format === 'pdf')) {
          omitted.push({ title: doc.title, originalName: file.originalName, reason: 'No es PDF' });
          continue;
        }
        let buffer: Buffer;
        try {
          buffer = await this.storage.readBuffer(file.storageKey);
        } catch {
          omitted.push({ title: doc.title, originalName: file.originalName, reason: 'Archivo no disponible' });
          continue;
        }
        if (pdf) {
          buffer = await this.pdfBrand.brandPdf(buffer, brand);
          if (!isSuper) {
            const marked = await this.pdfBrand.watermarkPdf(buffer, mark);
            // Nunca se entrega al consultorio una copia sin marca de agua.
            if (!marked) {
              omitted.push({
                title: doc.title,
                originalName: file.originalName,
                reason: 'No se pudo poner la marca de agua',
              });
              continue;
            }
            buffer = marked;
          }
        }
        items.push({
          pillarLabel: doc.pillarLabel,
          categoryName: doc.categoryName,
          code: doc.code,
          title: doc.title,
          fileId: file.id,
          version: file.version,
          originalName: file.originalName,
          buffer,
        });
      }
    }

    if (!items.length) {
      throw new NotFoundException(
        omitted.length
          ? 'No hay documentos PDF disponibles para descargar en este estándar.'
          : 'Este estándar aún no tiene documentos cargados.',
      );
    }

    const stamp = when.toISOString().slice(0, 10);
    const base = `Documentacion_${safeName(pillar ? pillarLabel : 'Completa', 40).replace(/ /g, '_')}_${safeName(
      data.clinic.name,
      40,
    ).replace(/ /g, '_')}_${stamp}`;

    await this.prisma.auditLog.create({
      data: {
        clinicId,
        userId: user.id,
        action: AuditAction.DOWNLOAD,
        entityType: 'DocumentStandardExport',
        entityId: pillar || 'ALL',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          format,
          pillar: pillar || null,
          files: items.length,
          fileIds: items.map((i) => i.fileId),
          omitted: omitted.length,
          watermarked: !isSuper,
        },
      },
    });

    if (format === 'zip') {
      const buffer = await this.buildZip(items, omitted, {
        clinic: data.clinic.name,
        scope: pillarLabel,
        by: mark.name,
        when,
        watermarked: !isSuper,
      });
      return new StreamableFile(buffer, {
        type: 'application/zip',
        disposition: `attachment; filename="${base}.zip"`,
      });
    }

    const buffer = await this.buildMergedPdf(items, omitted, {
      clinic: data.clinic.name,
      scope: pillarLabel,
      by: mark.name,
      when,
    });
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `attachment; filename="${base}.pdf"`,
    });
  }

  private async buildZip(
    items: ExportItem[],
    omitted: Omitted[],
    meta: { clinic: string; scope: string; by: string; when: Date; watermarked: boolean },
  ) {
    const archive = new AdmZip();
    const used = new Set<string>();
    const lines: string[] = [];
    for (const item of items) {
      const folder = `${safeName(item.pillarLabel, 60)}/${safeName(item.categoryName, 60)}`;
      const ext = item.originalName.includes('.') ? item.originalName.slice(item.originalName.lastIndexOf('.')) : '';
      const stem = safeName(item.originalName.slice(0, item.originalName.length - ext.length), 90);
      let name = `${folder}/${stem}${ext}`;
      for (let n = 2; used.has(name.toLowerCase()); n++) name = `${folder}/${stem} (${n})${ext}`;
      used.add(name.toLowerCase());
      archive.addFile(name, item.buffer);
      lines.push(`- ${item.code} · ${item.title} · v${item.version}\n  ${name}`);
    }

    const fecha = meta.when.toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: false });
    const readme = [
      `Documentación de habilitación · ${meta.clinic}`,
      `Alcance: ${meta.scope}`,
      `Descargado por: ${meta.by} · ${fecha}`,
      meta.watermarked
        ? 'Cada PDF lleva marca de agua de quien descarga. Uso exclusivo de este consultorio.'
        : 'Copia del superadministrador.',
      '',
      `Documentos incluidos (${items.length}):`,
      ...lines,
      ...(omitted.length
        ? ['', `No incluidos (${omitted.length}):`, ...omitted.map((o) => `- ${o.title} · ${o.originalName} · ${o.reason}`)]
        : []),
      '',
    ].join('\n');
    archive.addFile('LEEME.txt', Buffer.from(readme, 'utf8'));
    return archive.toBuffer();
  }

  private async buildMergedPdf(
    items: ExportItem[],
    omitted: Omitted[],
    meta: { clinic: string; scope: string; by: string; when: Date },
  ) {
    const out = await PDFDocument.create();
    out.setTitle(latin(`Documentación · ${meta.scope} · ${meta.clinic}`));
    out.setProducer('HABILISALUD');
    const font = await out.embedFont(StandardFonts.Helvetica);
    const bold = await out.embedFont(StandardFonts.HelveticaBold);

    // Se copian primero los documentos para saber en qué página empieza cada uno.
    const parts: Array<{ item: ExportItem; pages: number }> = [];
    const loaded: PDFDocument[] = [];
    for (const item of items) {
      try {
        const src = await PDFDocument.load(item.buffer, { ignoreEncryption: true });
        loaded.push(src);
        parts.push({ item, pages: src.getPageCount() });
      } catch (error) {
        this.logger.warn(`PDF ilegible al unir ${item.originalName}: ${error instanceof Error ? error.message : error}`);
        omitted.push({ title: item.title, originalName: item.originalName, reason: 'PDF ilegible' });
      }
    }
    if (!parts.length) throw new NotFoundException('No se pudo unir ningún documento.');

    // Índice: tamaño carta, filas con número de página de inicio.
    const W = 612;
    const H = 792;
    const M = 50;
    const rowH = 15;
    const rowsFirst = Math.floor((H - 230 - M) / rowH);
    const rowsNext = Math.floor((H - 2 * M - 30) / rowH);
    const totalRows = parts.length + (omitted.length ? omitted.length + 2 : 0);
    const indexPages = totalRows <= rowsFirst ? 1 : 1 + Math.ceil((totalRows - rowsFirst) / rowsNext);

    let start = indexPages + 1;
    const rows: Array<{ left: string; right: string; strong?: boolean }> = parts.map(({ item, pages }) => {
      const row = { left: `${item.code} · ${item.title} (v${item.version})`, right: String(start) };
      start += pages;
      return row;
    });
    if (omitted.length) {
      rows.push({ left: '', right: '' });
      rows.push({ left: `No incluidos (${omitted.length})`, right: '', strong: true });
      for (const o of omitted) rows.push({ left: `${o.title} · ${o.originalName} · ${o.reason}`, right: '' });
    }

    const fit = (text: string, f: typeof font, size: number, max: number) => {
      let t = latin(text);
      if (f.widthOfTextAtSize(t, size) <= max) return t;
      while (t.length > 3 && f.widthOfTextAtSize(`${t}...`, size) > max) t = t.slice(0, -1);
      return `${t}...`;
    };

    const fecha = meta.when.toLocaleString('es-CO', { timeZone: 'America/Bogota', hour12: false });
    let r = 0;
    for (let p = 0; p < indexPages; p++) {
      const page = out.addPage([W, H]);
      let y = H - M;
      if (p === 0) {
        page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: NAVY });
        page.drawText('DOCUMENTACIÓN DE HABILITACIÓN', { x: M, y: y - 10, size: 9, font: bold, color: GOLD });
        page.drawText(fit(meta.scope, bold, 20, W - 2 * M), { x: M, y: y - 36, size: 20, font: bold, color: NAVY });
        page.drawText(fit(meta.clinic, font, 12, W - 2 * M), { x: M, y: y - 56, size: 12, font, color: INK });
        page.drawText(fit(`Descargado por ${meta.by} · ${fecha}`, font, 9, W - 2 * M), {
          x: M,
          y: y - 74,
          size: 9,
          font,
          color: MUTED,
        });
        page.drawText(`${parts.length} documento(s)`, { x: M, y: y - 88, size: 9, font, color: MUTED });
        page.drawLine({ start: { x: M, y: y - 104 }, end: { x: M + 48, y: y - 104 }, thickness: 2, color: GOLD });
        page.drawText('Índice', { x: M, y: y - 130, size: 12, font: bold, color: NAVY });
        page.drawText('Página', { x: W - M - 34, y: y - 130, size: 9, font: bold, color: MUTED });
        y -= 150;
      } else {
        page.drawText('Índice (continuación)', { x: M, y: y - 10, size: 11, font: bold, color: NAVY });
        y -= 30;
      }
      const limit = p === 0 ? rowsFirst : rowsNext;
      for (let i = 0; i < limit && r < rows.length; i++, r++) {
        const row = rows[r];
        const f = row.strong ? bold : font;
        if (row.left) page.drawText(fit(row.left, f, 9, W - 2 * M - 50), { x: M, y, size: 9, font: f, color: INK });
        if (row.right) {
          page.drawText(row.right, { x: W - M - font.widthOfTextAtSize(row.right, 9), y, size: 9, font, color: INK });
        }
        y -= rowH;
      }
    }

    for (const src of loaded) {
      const pages = await out.copyPages(src, src.getPageIndices());
      for (const page of pages) out.addPage(page);
    }
    return Buffer.from(await out.save());
  }
}
