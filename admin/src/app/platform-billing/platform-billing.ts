import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminApiService } from '../admin-api.service';
import { AuthService } from '../auth.service';
import { WEBSITE_URL } from '../api.config';
import { Clinic } from '../models';
import {
  PaymentMethod,
  PlatformBillingApiService,
  PlatformChargeKind,
  PlatformFee,
  PlatformPlanVariant,
  PlatformReceipt,
  PlatformReceiptStatus,
  MonthlyIncomeReport,
  HostingStatusRow,
} from './platform-billing-api.service';

type Tab = 'resumen' | 'nuevo' | 'tarifas' | 'mensual';

@Component({
  selector: 'app-platform-billing',
  imports: [FormsModule, RouterLink, CurrencyPipe, DatePipe],
  templateUrl: './platform-billing.html',
  styleUrl: './platform-billing.scss',
})
export class PlatformBillingPage implements OnInit {
  private readonly api = inject(PlatformBillingApiService);
  private readonly adminApi = inject(AdminApiService);
  private readonly auth = inject(AuthService);

  readonly websiteUrl = WEBSITE_URL;
  readonly user = this.auth.user;
  readonly tab = signal<Tab>('resumen');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

  clinics = signal<Clinic[]>([]);
  fees = signal<PlatformFee[]>([]);
  receipts = signal<PlatformReceipt[]>([]);
  income = signal<MonthlyIncomeReport | null>(null);
  hostingRows = signal<HostingStatusRow[]>([]);

  readonly methods: Array<{ value: PaymentMethod; label: string }> = [
    { value: 'TRANSFER', label: 'Transferencia' },
    { value: 'CASH', label: 'Efectivo' },
    { value: 'NEQUI', label: 'Nequi' },
    { value: 'DAVIPLATA', label: 'Daviplata' },
    { value: 'CARD', label: 'Tarjeta' },
    { value: 'PSE', label: 'PSE' },
    { value: 'OTHER', label: 'Otro' },
  ];

  form = {
    clinicId: '',
    kind: 'CLINIC_SETUP' as PlatformChargeKind,
    plan: 'WITHOUT_DOCS' as PlatformPlanVariant,
    amount: null as number | null,
    method: 'TRANSFER' as PaymentMethod,
    periodMonth: new Date().toISOString().slice(0, 7),
    notes: '',
    status: 'PAID' as PlatformReceiptStatus,
  };

  monthlyForm = {
    periodMonth: new Date().toISOString().slice(0, 7),
    method: 'TRANSFER' as PaymentMethod,
    clinicId: '',
    amount: null as number | null,
    status: 'PENDING' as PlatformReceiptStatus,
  };

  readonly busyReceiptId = signal<string | null>(null);

  incomeYear = new Date().getFullYear();

  ngOnInit() {
    this.adminApi.listClinics().subscribe({
      next: (rows) => this.clinics.set(rows),
      error: () => undefined,
    });
    this.reload();
  }

  setTab(tab: Tab) {
    this.tab.set(tab);
    this.error.set('');
    this.notice.set('');
    this.reload();
  }

  logout() {
    this.auth.logout();
  }

  goHome() {
    window.location.href = this.websiteUrl;
  }

  reload() {
    this.loading.set(true);
    this.error.set('');
    const tab = this.tab();
    if (tab === 'resumen') {
      this.api.monthlyIncome(this.incomeYear).subscribe({
        next: (row) => {
          this.income.set(row);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'No se pudo cargar el resumen.');
        },
      });
      this.api.listReceipts().subscribe({
        next: (rows) => this.receipts.set(rows),
        error: () => undefined,
      });
      return;
    }
    if (tab === 'tarifas' || tab === 'nuevo') {
      this.api.listFees().subscribe({
        next: (rows) => {
          this.fees.set(rows);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'No se pudieron cargar las tarifas.');
        },
      });
      return;
    }
    if (tab === 'mensual') {
      this.loadHostingStatus();
      return;
    }
    this.loading.set(false);
  }

  loadHostingStatus() {
    this.loading.set(true);
    this.api.hostingStatus(this.monthlyForm.periodMonth).subscribe({
      next: (rows) => {
        this.hostingRows.set(rows);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'No se pudo cargar el estado de arrendamiento.');
      },
    });
  }

  statusLabel(status: HostingStatusRow['status']) {
    if (status === 'PAID') return 'Pagado';
    if (status === 'SUSPENDED') return 'Suspendido';
    if (status === 'PENDING') return 'Pendiente';
    return 'Sin cobro';
  }

  periodRange(ym: string) {
    const [y, m] = ym.split('-').map(Number);
    if (!y || !m) return '';
    const fmt = (d: Date) =>
      d.toLocaleDateString('es-CO', {
        timeZone: 'UTC',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    return `${fmt(new Date(Date.UTC(y, m - 1, 0)))} – ${fmt(new Date(Date.UTC(y, m, 0)))}`;
  }

  markPaid(id: string, number: string) {
    if (!window.confirm(`¿Registrar el pago del cobro ${number} con fecha de hoy?`)) return;
    this.updateReceiptStatus(id, this.api.markReceiptPaid(id), `Cobro ${number} marcado como pagado.`);
  }

  markPending(id: string, number: string) {
    const ok = window.confirm(
      `El cobro ${number} quedará pendiente (se conserva el número y el monto; deja de contarse como ingreso). ¿Continuar?`,
    );
    if (!ok) return;
    this.updateReceiptStatus(id, this.api.markReceiptPending(id), `Cobro ${number} marcado como pendiente.`);
  }

  private updateReceiptStatus(
    id: string,
    request: ReturnType<PlatformBillingApiService['markReceiptPaid']>,
    message: string,
  ) {
    this.busyReceiptId.set(id);
    this.error.set('');
    request.subscribe({
      next: () => {
        this.busyReceiptId.set(null);
        this.notice.set(message);
        this.reload();
      },
      error: (err) => {
        this.busyReceiptId.set(null);
        this.error.set(err?.error?.message || 'No se pudo actualizar el cobro.');
      },
    });
  }

  suggestedAmount(): number | null {
    const fee = this.fees().find(
      (f) => f.kind === this.form.kind && f.plan === this.form.plan,
    );
    return fee ? fee.amount : null;
  }

  applySuggestedAmount() {
    const suggested = this.suggestedAmount();
    if (suggested != null) this.form.amount = suggested;
  }

  onKindOrPlanChange() {
    // El SUPER_ADMIN define el monto; no se sobrescribe al cambiar concepto/plan.
  }

  createReceipt() {
    if (!this.form.clinicId) {
      this.error.set('Seleccione un consultorio.');
      return;
    }
    const amount = Number(this.form.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      this.error.set('Indique el monto del cobro.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.api
      .createReceipt({
        clinicId: this.form.clinicId,
        kind: this.form.kind,
        plan: this.form.plan,
        amount,
        method: this.form.method,
        periodMonth:
          this.form.kind === 'MONTHLY_HOSTING' ? this.form.periodMonth : undefined,
        notes: this.form.notes || undefined,
        status: this.form.status,
      })
      .subscribe({
        next: (row) => {
          this.loading.set(false);
          this.notice.set(
            `${row.status === 'PENDING' ? 'Cuenta de cobro' : 'Recibo'} ${row.number} creado por ${row.amount.toLocaleString('es-CO')} COP.`,
          );
          this.form.notes = '';
          this.form.amount = null;
          this.setTab('resumen');
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(
            Array.isArray(err?.error?.message)
              ? err.error.message.join(' ')
              : err?.error?.message || 'No se pudo crear el recibo.',
          );
        },
      });
  }

  saveFee(fee: PlatformFee, amountStr: string) {
    const amount = Number(String(amountStr).replace(/[^\d.]/g, ''));
    if (!Number.isFinite(amount) || amount < 0) {
      this.error.set('Monto inválido.');
      return;
    }
    this.api.updateFee(fee.id, { amount }).subscribe({
      next: () => {
        this.notice.set(`Tarifa «${fee.label}» actualizada.`);
        this.reload();
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'No se pudo guardar la tarifa.');
      },
    });
  }

  generateMonthly() {
    const amount = Number(this.monthlyForm.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      this.error.set('Indique el monto del arrendamiento mensual.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.api
      .generateMonthlyHosting({
        periodMonth: this.monthlyForm.periodMonth,
        method: this.monthlyForm.method,
        clinicId: this.monthlyForm.clinicId || undefined,
        amount,
        status: this.monthlyForm.status,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.notice.set(
            `Periodo ${res.periodMonth}: ${res.createdCount} cobro(s) creados, ${res.skippedCount} omitidos.`,
          );
          this.loadHostingStatus();
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'No se pudo generar el cobro mensual.');
        },
      });
  }

  notifyDue(clinicId?: string) {
    this.loading.set(true);
    this.error.set('');
    this.api
      .notifyHostingDue({
        periodMonth: this.monthlyForm.periodMonth,
        clinicId: clinicId || this.monthlyForm.clinicId || undefined,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.notice.set(
            `Aviso de mora enviado a ${res.count} consultorio(s) del periodo ${res.periodMonth}.`,
          );
          this.loadHostingStatus();
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'No se pudo enviar el aviso.');
        },
      });
  }

  suspendUnpaid(clinicId?: string) {
    const ok = window.confirm(
      'Se desactivarán los usuarios de los consultorios sin pago de este periodo y se enviará un correo al admin para que se ponga al día. ¿Continuar?',
    );
    if (!ok) return;
    this.loading.set(true);
    this.error.set('');
    this.api
      .suspendUnpaidHosting({
        periodMonth: this.monthlyForm.periodMonth,
        clinicId: clinicId || this.monthlyForm.clinicId || undefined,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          const users = res.results.reduce((s, r) => s + r.deactivatedUsers, 0);
          this.notice.set(
            `Periodo ${res.periodMonth}: ${res.suspendedCount} consultorio(s) en mora; ${users} usuario(s) desactivados. Se notificó a los admins.`,
          );
          this.loadHostingStatus();
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'No se pudo suspender.');
        },
      });
  }

  openPdf(id: string) {
    const token = this.auth.token();
    const url = this.api.receiptPdfUrl(id);
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => r.blob())
      .then((blob) => {
        const href = URL.createObjectURL(blob);
        window.open(href, '_blank');
      })
      .catch(() => this.error.set('No se pudo abrir el PDF.'));
  }

  changeYear(delta: number) {
    this.incomeYear += delta;
    this.reload();
  }
}
