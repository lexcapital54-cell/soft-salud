import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class ClinicalStorageService {
  constructor(private readonly config: ConfigService) {}

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
  ): Promise<{ storageKey: string; absolutePath: string; contentHash: string }> {
    const storageKey = path.join(relativeDir, fileName).replace(/\\/g, '/');
    const absolutePath = this.resolveAbsolutePath(storageKey);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);
    const contentHash = createHash('sha256').update(buffer).digest('hex');
    return { storageKey, absolutePath, contentHash };
  }

  async readBuffer(storageKey: string): Promise<Buffer> {
    const absolutePath = this.resolveAbsolutePath(storageKey);
    if (!existsSync(absolutePath)) {
      throw new Error(`Archivo no encontrado: ${storageKey}`);
    }
    return fs.readFile(absolutePath);
  }
}
