import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaService } from '../../prisma/prisma.module';

/**
 * Almacenamiento dual: Postgres (`stored_files`) como fuente de verdad +
 * espejo en disco (`STORAGE_ROOT`) para lectura rápida local.
 */
@Injectable()
export class ClinicalStorageService {
  private readonly logger = new Logger(ClinicalStorageService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  storageRoot() {
    return (
      this.config.get<string>('STORAGE_ROOT') ||
      path.join(process.cwd(), 'storage')
    );
  }

  resolveAbsolutePath(storageKey: string) {
    return path.join(this.storageRoot(), storageKey);
  }

  async writeBuffer(
    relativeDir: string,
    fileName: string,
    buffer: Buffer,
    mimeType = 'application/octet-stream',
  ): Promise<{ storageKey: string; absolutePath: string; contentHash: string }> {
    const storageKey = path.join(relativeDir, fileName).replace(/\\/g, '/');
    const absolutePath = this.resolveAbsolutePath(storageKey);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);
    const contentHash = createHash('sha256').update(buffer).digest('hex');

    await this.upsertBlob(storageKey, buffer, mimeType, contentHash);

    return { storageKey, absolutePath, contentHash };
  }

  /** Persiste en BD un archivo que ya existe en disco (p. ej. PDFs de consentimientos). */
  async persistExisting(
    storageKey: string,
    mimeType = 'application/octet-stream',
  ): Promise<{ contentHash: string; sizeBytes: number }> {
    const absolutePath = this.resolveAbsolutePath(storageKey);
    const buffer = await fs.readFile(absolutePath);
    const contentHash = createHash('sha256').update(buffer).digest('hex');
    await this.upsertBlob(storageKey, buffer, mimeType, contentHash);
    return { contentHash, sizeBytes: buffer.length };
  }

  async readBuffer(storageKey: string): Promise<Buffer> {
    const row = await this.prisma.storedFile.findUnique({
      where: { storageKey },
      select: { data: true },
    });
    if (row?.data?.length) {
      return Buffer.from(row.data);
    }

    const absolutePath = this.resolveAbsolutePath(storageKey);
    if (!existsSync(absolutePath)) {
      throw new Error(`Archivo no encontrado: ${storageKey}`);
    }
    const buffer = await fs.readFile(absolutePath);

    // Backfill a BD para que no dependa del disco en el futuro.
    const mime = this.guessMime(storageKey);
    const contentHash = createHash('sha256').update(buffer).digest('hex');
    void this.upsertBlob(storageKey, buffer, mime, contentHash).catch((err) => {
      this.logger.warn(
        `No se pudo backfillear ${storageKey}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });

    return buffer;
  }

  private async upsertBlob(
    storageKey: string,
    buffer: Buffer,
    mimeType: string,
    contentHash: string,
  ) {
    const data = Uint8Array.from(buffer);
    await this.prisma.storedFile.upsert({
      where: { storageKey },
      create: {
        storageKey,
        mimeType,
        sizeBytes: buffer.length,
        contentHash,
        data,
      },
      update: {
        mimeType,
        sizeBytes: buffer.length,
        contentHash,
        data,
      },
    });
  }

  private guessMime(storageKey: string) {
    const lower = storageKey.toLowerCase();
    if (lower.endsWith('.pdf')) return 'application/pdf';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.docx')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (lower.endsWith('.doc')) return 'application/msword';
    return 'application/octet-stream';
  }
}
