import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { ClinicalApiService } from '../clinical/clinical-api.service';
import { SivigilaCaseRow, SivigilaSummary } from '../clinical/clinical.models';

@Component({
  selector: 'app-sivigila-audit',
  imports: [FormsModule, RouterLink, DatePipe],
  templateUrl: './sivigila-audit.html',
  styleUrl: './sivigila-audit.scss',
})
export class SivigilaAudit implements OnInit {
  private readonly api = inject(ClinicalApiService);
  private readonly auth = inject(AuthService);

  readonly user = this.auth.user;
  readonly loading = signal(false);
  readonly error = signal('');
  readonly cases = signal<SivigilaCaseRow[]>([]);
  readonly summary = signal<SivigilaSummary | null>(null);

  from = '';
  to = '';
  cieCode = '';

  ngOnInit() {
    this.refresh();
  }

  refresh() {
    this.loading.set(true);
    this.error.set('');
    const opts = {
      from: this.from || undefined,
      to: this.to || undefined,
      cieCode: this.cieCode || undefined,
    };
    this.api.sivigilaCases(opts).subscribe({
      next: (res) => {
        this.cases.set(res.items);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'No se pudo cargar SIVIGILA.');
      },
    });
    this.api.sivigilaSummary({ from: opts.from, to: opts.to }).subscribe({
      next: (s) => this.summary.set(s),
      error: () => undefined,
    });
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportCsv() {
    this.api
      .sivigilaExportCsv({
        from: this.from || undefined,
        to: this.to || undefined,
        cieCode: this.cieCode || undefined,
      })
      .subscribe({
        next: (blob) => this.downloadBlob(blob, 'sivigila-casos.csv'),
        error: () => this.error.set('No se pudo exportar CSV.'),
      });
  }

  exportExcel() {
    this.api
      .sivigilaExportExcel({
        from: this.from || undefined,
        to: this.to || undefined,
        cieCode: this.cieCode || undefined,
      })
      .subscribe({
        next: (blob) => this.downloadBlob(blob, 'sivigila-casos.xlsx'),
        error: () => this.error.set('No se pudo exportar Excel.'),
      });
  }
}
