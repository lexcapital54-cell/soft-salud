import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { ClinicalApiService } from '../clinical/clinical-api.service';
import { Patient } from '../clinical/clinical.models';
import {
  BillingApiService,
  BillingExpense,
  BillingPackage,
  BillingReceipt,
  DailyClose,
  PaymentMethod,
} from './billing-api.service';
import { PlanReceiptLine, ReceiptPlanPicker } from './receipt-plan-picker';

type Tab = 'recibos' | 'nuevo' | 'gastos' | 'paquetes' | 'cierre';

@Component({
  selector: 'app-billing-dashboard',
  imports: [FormsModule, RouterLink, CurrencyPipe, DatePipe, ReceiptPlanPicker],
  templateUrl: './billing-dashboard.html',
  styleUrl: './billing-dashboard.scss',
})
export class BillingDashboard implements OnInit {
  private readonly api = inject(BillingApiService);
  private readonly clinical = inject(ClinicalApiService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  readonly tab = signal<Tab>('recibos');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');

  receipts = signal<BillingReceipt[]>([]);
  expenses = signal<BillingExpense[]>([]);
  packages = signal<BillingPackage[]>([]);
  daily = signal<DailyClose | null>(null);
  patients = signal<Patient[]>([]);
  readonly planLines = signal<PlanReceiptLine[]>([]);
  readonly planReloadKey = signal(0);

  readonly methods: Array<{ value: PaymentMethod; label: string }> = [
    { value: 'CASH', label: 'Efectivo' },
    { value: 'TRANSFER', label: 'Transferencia' },
    { value: 'CARD', label: 'Tarjeta' },
    { value: 'NEQUI', label: 'Nequi' },
    { value: 'DAVIPLATA', label: 'Daviplata' },
    { value: 'PSE', label: 'PSE' },
    { value: 'OTHER', label: 'Otro' },
  ];

  receiptForm = {
    patientId: '',
    appointmentId: '',
    description: 'Consulta',
    unitPrice: 0,
    quantity: 1,
    method: 'CASH' as PaymentMethod,
    notes: '',
    packageId: '',
  };

  expenseForm = {
    category: 'Gastos operativos',
    amount: 0,
    method: 'CASH' as PaymentMethod,
    notes: '',
  };

  packageForm = {
    patientId: '',
    name: 'Paquete de sesiones',
    totalSessions: 4,
    unitPrice: 0,
    cupsCode: '',
  };

  closeDate = new Date().toISOString().slice(0, 10);

  ngOnInit() {
    const q = this.route.snapshot.queryParamMap;
    const patientId = q.get('patientId') || '';
    const appointmentId = q.get('appointmentId') || '';
    const patientName = q.get('patientName') || '';
    if (patientId) {
      this.receiptForm.patientId = patientId;
      this.receiptForm.appointmentId = appointmentId;
      if (patientName) {
        this.receiptForm.description = `Consulta — ${patientName}`;
      }
      this.tab.set('nuevo');
    }
    this.loadPatients();
    this.reload();
  }

  setTab(tab: Tab) {
    this.tab.set(tab);
    this.error.set('');
    this.notice.set('');
    this.reload();
  }

  logout() {
    this.auth.logoutToClinicLogin();
  }

  private loadPatients() {
    this.clinical.listPatients({}).subscribe({
      next: (rows) => this.patients.set(rows.slice(0, 200)),
      error: () => undefined,
    });
  }

  reload() {
    this.loading.set(true);
    this.error.set('');
    const tab = this.tab();
    if (tab === 'recibos' || tab === 'nuevo') {
      this.api.listReceipts().subscribe({
        next: (rows) => {
          this.receipts.set(rows);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'No se pudieron cargar los recibos.');
        },
      });
      if (this.receiptForm.patientId) {
        this.api.listPackages(this.receiptForm.patientId).subscribe({
          next: (rows) => this.packages.set(rows.filter((p) => p.status === 'ACTIVE')),
          error: () => undefined,
        });
      }
      return;
    }
    if (tab === 'gastos') {
      this.api.listExpenses().subscribe({
        next: (rows) => {
          this.expenses.set(rows);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'No se pudieron cargar los gastos.');
        },
      });
      return;
    }
    if (tab === 'paquetes') {
      this.api.listPackages().subscribe({
        next: (rows) => {
          this.packages.set(rows);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'No se pudieron cargar los paquetes.');
        },
      });
      return;
    }
    this.api.dailyClose(this.closeDate).subscribe({
      next: (row) => {
        this.daily.set(row);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'No se pudo cargar el cierre.');
      },
    });
  }

  onPatientChange() {
    if (!this.receiptForm.patientId) return;
    this.api.listPackages(this.receiptForm.patientId).subscribe({
      next: (rows) => this.packages.set(rows.filter((p) => p.status === 'ACTIVE')),
      error: () => undefined,
    });
  }

  createReceipt() {
    this.error.set('');
    if (!this.receiptForm.patientId) {
      this.error.set('Seleccione un paciente.');
      return;
    }
    if (this.receiptForm.unitPrice < 0) {
      this.error.set('El valor no puede ser negativo.');
      return;
    }
    const items = this.receiptItems();
    if (!items.length) {
      this.error.set('Seleccione procedimientos del plan o diligencie la línea manual.');
      return;
    }
    this.loading.set(true);
    this.api
      .createReceipt({
        patientId: this.receiptForm.patientId,
        appointmentId: this.receiptForm.appointmentId || undefined,
        method: this.receiptForm.method,
        notes: this.receiptForm.notes || undefined,
        items,
      })
      .subscribe({
        next: (row) => {
          this.loading.set(false);
          this.notice.set(`Recibo ${row.number} creado.`);
          this.receiptForm.appointmentId = '';
          this.receiptForm.notes = '';
          this.receiptForm.packageId = '';
          this.planReloadKey.update((k) => k + 1);
          this.tab.set('recibos');
          this.reload();
          this.openPdf(row.id);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'No se pudo crear el recibo.');
        },
      });
  }

  /** Líneas del plan de tratamiento más la línea manual (si tiene valor o no hay líneas del plan). */
  private receiptItems() {
    const plan = this.planLines();
    const manualPrice = Number(this.receiptForm.unitPrice) || 0;
    const manual =
      !plan.length || manualPrice > 0 || this.receiptForm.packageId
        ? [
            {
              description: this.receiptForm.description || 'Consulta',
              quantity: this.receiptForm.quantity || 1,
              unitPrice: manualPrice,
              packageId: this.receiptForm.packageId || undefined,
              appointmentId: this.receiptForm.appointmentId || undefined,
            },
          ]
        : [];
    return [...plan, ...manual];
  }

  receiptTotal() {
    return this.receiptItems().reduce((s, i) => s + (i.quantity || 1) * i.unitPrice, 0);
  }

  createExpense() {
    this.error.set('');
    if (!this.expenseForm.category.trim() || this.expenseForm.amount <= 0) {
      this.error.set('Indique categoría y un monto mayor a cero.');
      return;
    }
    this.loading.set(true);
    this.api
      .createExpense({
        category: this.expenseForm.category,
        amount: Number(this.expenseForm.amount),
        method: this.expenseForm.method,
        notes: this.expenseForm.notes || undefined,
      })
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.notice.set('Gasto registrado.');
          this.expenseForm.amount = 0;
          this.expenseForm.notes = '';
          this.reload();
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'No se pudo registrar el gasto.');
        },
      });
  }

  createPackage() {
    this.error.set('');
    if (!this.packageForm.patientId) {
      this.error.set('Seleccione un paciente.');
      return;
    }
    this.loading.set(true);
    this.api
      .createPackage({
        patientId: this.packageForm.patientId,
        name: this.packageForm.name,
        totalSessions: Number(this.packageForm.totalSessions),
        unitPrice: Number(this.packageForm.unitPrice),
        cupsCode: this.packageForm.cupsCode || undefined,
      })
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.notice.set('Paquete creado.');
          this.reload();
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message || 'No se pudo crear el paquete.');
        },
      });
  }

  openPdf(id: string) {
    const token = localStorage.getItem('habilisalud_token');
    const url = this.api.receiptPdfUrl(id);
    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('PDF');
        const blob = await res.blob();
        const obj = URL.createObjectURL(blob);
        window.open(obj, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(obj), 60_000);
      })
      .catch(() => this.error.set('No se pudo abrir el PDF del recibo.'));
  }

  patientLabel(p: Patient) {
    return `${p.lastName} ${p.firstName} · ${p.documentType} ${p.documentNumber}`;
  }
}
