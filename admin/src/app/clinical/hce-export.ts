import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../auth.service';
import { WEBSITE_URL } from '../api.config';
import { ClinicalApiService } from './clinical-api.service';
import { HceExportItem } from './clinical.models';

@Component({
  selector: 'app-hce-export',
  imports: [FormsModule, DatePipe],
  templateUrl: './hce-export.html',
  styleUrl: './hce-export.scss',
})
export class HceExport implements OnInit {
  private readonly api = inject(ClinicalApiService);
  private readonly auth = inject(AuthService);

  readonly websiteUrl = WEBSITE_URL;
  readonly user = this.auth.user;
  readonly canDownload = this.auth.canWriteClinical;

  readonly items = signal<HceExportItem[]>([]);
  readonly loading = signal(false);
  readonly downloading = signal(false);
  readonly error = signal('');
  readonly message = signal('');

  query = '';

  ngOnInit() {
    this.search();
  }

  search() {
    this.loading.set(true);
    this.error.set('');
    this.api.searchHceExports(this.query.trim() || undefined).subscribe({
      next: (rows) => {
        this.items.set(rows);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'No se pudo cargar el listado.');
      },
    });
  }

  downloadOne(item: HceExportItem) {
    if (!this.canDownload()) return;
    this.downloading.set(true);
    this.error.set('');
    this.api.downloadHcePdf(item.encounterId).subscribe({
      next: (blob) => {
        this.saveBlob(blob, item.fileName);
        this.downloading.set(false);
        this.message.set(`PDF descargado: ${item.patientName}`);
      },
      error: (err) => {
        this.downloading.set(false);
        this.error.set(err?.error?.message || 'No se pudo generar el PDF.');
      },
    });
  }

  downloadAll() {
    if (!this.canDownload()) return;
    this.downloading.set(true);
    this.error.set('');
    this.api.downloadHceBulkZip(this.query.trim() || undefined).subscribe({
      next: (blob) => {
        this.saveBlob(blob, 'historias-clinicas.zip');
        this.downloading.set(false);
        this.message.set('ZIP con historias clínicas descargado.');
      },
      error: () => {
        this.downloading.set(false);
        this.error.set('No se pudo generar el archivo ZIP.');
      },
    });
  }

  private saveBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  logout() {
    this.auth.logoutToClinicLogin();
  }
}
