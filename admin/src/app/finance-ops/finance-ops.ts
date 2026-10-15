import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AdminApiService } from '../admin-api.service';
import { AuthService } from '../auth.service';
import { BillingApiService, BillingExpense, BillingReceipt, BillingSummary } from '../billing/billing-api.service';
import { HabIcon } from '../habilitation/hab-icon';
import { Clinic } from '../models';
import {
  MonthlyIncomeReport,
  PlatformBillingApiService,
  PlatformReceipt,
} from '../platform-billing/platform-billing-api.service';
import {
  FinanceApiService,
  FinanceInventorySummary,
  FinanceSupplyItem,
  NoveltyType,
  PayStatus,
  SupplyCategory,
  SupplyMovementType,
} from './finance-api.service';
import { ARL_RATES, ArlClass, PayrollInput, PayrollParams, PayrollResult, calcPayroll } from './payroll-calc';

type Section = 'dashboard' | 'empleados' | 'facturacion' | 'tesoreria' | 'nomina' | 'inventarios' | 'reportes' | 'config';
type PayrollTab = 'liquidacion' | 'pila' | 'novedades' | 'reportes';

interface EmployeeForm {
  name: string;
  idNumber: string;
  role: string;
  department: string;
  period: string;
  payDate: string;
}

interface PayrollRun extends EmployeeForm {
  id: string;
  status: PayStatus;
  input: PayrollInput;
  result: PayrollResult;
}

interface Novelty {
  id: string;
  employee: string;
  type: NoveltyType;
  from: string;
  to: string;
  notes: string;
}

/** Movimiento normalizado: cobro de la plataforma, o recibo / gasto del consultorio. */
interface FinDoc {
  id: string;
  number: string;
  partyId: string;
  party: string;
  concept: string;
  issuedAt: string;
  paidAt: string | null;
  amount: number;
  type: 'INCOME' | 'EXPENSE';
  status: 'PAID' | 'PENDING';
  statusLabel: string;
  pdf: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Fecha local YYYY-MM-DD. */
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthKey = (iso: string) => ymd(new Date(iso)).slice(0, 7);

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const COP = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });

const today = () => new Date().toISOString().slice(0, 10);

const emptyInput = (): PayrollInput => ({
  salary: 0,
  days: 30,
  overtime: 0,
  commissions: 0,
  bonusSalary: 0,
  bonusNonSalary: 0,
  sickPay: 0,
  withholding: 0,
  otherDeductions: 0,
  arlClass: 1,
});

/**
 * Operación y Finanzas: nómina y PILA (calculadora de referencia), facturación, tesorería e inventario.
 * En el superadmin usa los cobros de la plataforma; en el consultorio (ruta con data.mode = 'clinic'),
 * sus recibos de caja, gastos, liquidaciones, novedades e inventario persistidos en el servidor.
 */
@Component({
  selector: 'app-finance-ops',
  imports: [FormsModule, RouterLink, HabIcon, DatePipe, NgTemplateOutlet],
  templateUrl: './finance-ops.html',
  styleUrl: './finance-ops.scss',
  host: {
    '(window:beforeunload)': 'onBeforeUnload($event)',
    '(document:keydown.escape)': 'navOpen.set(false)',
  },
})
export class FinanceOpsPage implements OnInit {
  private readonly billingApi = inject(PlatformBillingApiService);
  private readonly adminApi = inject(AdminApiService);
  private readonly auth = inject(AuthService);
  private readonly clinicBilling = inject(BillingApiService);
  private readonly financeApi = inject(FinanceApiService);
  private readonly route = inject(ActivatedRoute);

  readonly isClinic = this.route.snapshot.data['mode'] === 'clinic';
  /** Encabezado de la columna del tercero en las tablas de movimientos. */
  readonly partyLabel = this.isClinic ? 'Paciente / responsable' : 'Consultorio';
  readonly user = this.auth.user;
  readonly navOpen = signal(false);

  readonly sections: Array<{ id: Section; num: string; label: string; icon: string; subtitle: string }> = [
    {
      id: 'dashboard', num: '01', label: 'Dashboard', icon: 'dashboard',
      subtitle: 'Resumen de nómina, facturación, cartera e inventario.',
    },
    {
      id: 'empleados', num: '02', label: 'Empleados', icon: 'users',
      subtitle: 'Empleados liquidados en el periodo y novedades de nómina.',
    },
    {
      id: 'facturacion', num: '05', label: 'Facturación y RIPS', icon: 'receipt',
      subtitle: this.isClinic
        ? 'Recibos de caja emitidos por el consultorio y estado de RIPS.'
        : 'Cobros emitidos por la plataforma, estado de pago y activación de RIPS por consultorio.',
    },
    {
      id: 'tesoreria', num: '06', label: 'Tesorería y Cartera', icon: 'scale',
      subtitle: this.isClinic
        ? 'Ingresos, egresos y flujo de caja del consultorio.'
        : 'Recaudos, cuentas de cobro pendientes y envejecimiento de cartera por consultorio.',
    },
    {
      id: 'nomina', num: '07', label: 'Nómina y PILA', icon: 'clipboard',
      subtitle: 'Cálculo de referencia de devengados, deducciones y aportes a seguridad social y parafiscales.',
    },
    {
      id: 'inventarios', num: '08', label: 'Inventarios', icon: 'package',
      subtitle: 'Insumos, entradas, salidas y alertas de stock.',
    },
    { id: 'reportes', num: '', label: 'Reportes', icon: 'activity', subtitle: 'Totales del periodo y descarga del resumen.' },
    { id: 'config', num: '', label: 'Configuración', icon: 'settings', subtitle: 'Parámetros usados por la calculadora de nómina.' },
  ];
  readonly section = signal<Section>('nomina');
  readonly sectionInfo = computed(() => this.sections.find((s) => s.id === this.section())!);

  readonly payrollTabs: Array<{ id: PayrollTab; label: string }> = [
    { id: 'liquidacion', label: 'Liquidación de nómina' },
    { id: 'pila', label: 'Planilla de seguridad social (PILA)' },
    { id: 'novedades', label: 'Novedades del empleado' },
    { id: 'reportes', label: 'Reportes' },
  ];
  readonly payrollTab = signal<PayrollTab>('liquidacion');

  readonly arlOptions = (Object.keys(ARL_RATES) as unknown as ArlClass[]).map((k) => ({
    value: Number(k) as ArlClass,
    label: `${ARL_RATES[k].label} (${this.pct(ARL_RATES[k].rate)})`,
  }));

  readonly noveltyTypes: Array<{ value: NoveltyType; label: string }> = [
    { value: 'INGRESO', label: 'Ingreso' },
    { value: 'VACACIONES', label: 'Vacaciones' },
    { value: 'INCAPACIDAD', label: 'Incapacidad médica' },
    { value: 'LICENCIA_REM', label: 'Licencia remunerada' },
    { value: 'LICENCIA_NO_REM', label: 'Licencia no remunerada' },
    { value: 'RETIRO', label: 'Retiro' },
  ];

  readonly statusLabels: Record<PayStatus, string> = {
    LIQUIDADO: 'Liquidado',
    PAGADO: 'Pagado',
    PENDIENTE: 'Pendiente',
  };

  /** Valores 2026 (Decreto de salario mínimo); se pueden ajustar en Configuración. */
  readonly params = signal<PayrollParams>({ smmlv: 1_750_905, transportAid: 249_095, exempt114: true });

  readonly employee = signal<EmployeeForm>({
    name: '',
    idNumber: '',
    role: '',
    department: '',
    period: new Date().toISOString().slice(0, 7),
    payDate: today(),
  });
  readonly input = signal<PayrollInput>(emptyInput());
  readonly result = computed(() => calcPayroll(this.input(), this.params()));

  readonly runs = signal<PayrollRun[]>([]);
  readonly novelties = signal<Novelty[]>([]);
  noveltyForm: Omit<Novelty, 'id'> = { employee: '', type: 'INGRESO', from: today(), to: today(), notes: '' };

  readonly supplyItems = signal<FinanceSupplyItem[]>([]);
  readonly inventorySummary = signal<FinanceInventorySummary | null>(null);
  readonly saving = signal(false);
  supplyForm = {
    name: '',
    sku: '',
    unit: 'und',
    category: 'CONSUMABLE' as SupplyCategory,
    unitCost: 0,
    minStock: 0,
    initialQuantity: 0,
    lotNumber: '',
    notes: '',
  };
  movementForm = { itemId: '', type: 'IN' as SupplyMovementType, quantity: 1, notes: '' };

  readonly categoryLabels: Record<SupplyCategory, string> = {
    CONSUMABLE: 'Consumible',
    MEDICATION: 'Medicamento',
    AESTHETIC: 'Estética',
  };

  readonly notice = signal('');
  readonly formError = signal('');

  // Datos reales de la plataforma (cobros a los consultorios).
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly receipts = signal<PlatformReceipt[]>([]);
  readonly income = signal<MonthlyIncomeReport | null>(null);
  readonly clinics = signal<Clinic[]>([]);

  // Datos del consultorio (recibos de caja y gastos).
  readonly clinicReceipts = signal<BillingReceipt[]>([]);
  readonly expenses = signal<BillingExpense[]>([]);
  readonly summaryMonth = signal<BillingSummary | null>(null);
  readonly summaryPrev = signal<BillingSummary | null>(null);
  readonly summaryYear = signal<BillingSummary | null>(null);

  readonly docs = computed<FinDoc[]>(() => {
    if (!this.isClinic) {
      return this.receipts().map((r) => ({
        id: r.id,
        number: r.number,
        partyId: r.clinicId,
        party: r.clinic?.name || r.payerName || 'Sin consultorio',
        concept: r.kindLabel,
        issuedAt: r.createdAt,
        paidAt: r.paidAt,
        amount: r.amount,
        type: 'INCOME' as const,
        status: r.status,
        statusLabel: r.statusLabel,
        pdf: true,
      }));
    }
    const income: FinDoc[] = this.clinicReceipts().map((r) => {
      const first = r.items[0]?.description || 'Recibo de caja';
      const date = r.issuedAt || '';
      return {
        id: r.id,
        number: r.number,
        partyId: r.patient?.id || '',
        party: [r.patient?.firstName, r.patient?.lastName].filter(Boolean).join(' ') || '—',
        concept: r.items.length > 1 ? `${first} y ${r.items.length - 1} más` : first,
        issuedAt: date,
        paidAt: date,
        amount: r.total,
        type: 'INCOME' as const,
        status: 'PAID' as const,
        statusLabel: 'Ingreso',
        pdf: true,
      };
    });
    const out: FinDoc[] = this.expenses().map((e) => ({
      id: e.id,
      number: '—',
      partyId: '',
      party: e.createdBy?.fullName || '—',
      concept: e.category + (e.notes ? ` · ${e.notes}` : ''),
      issuedAt: e.paidAt,
      paidAt: e.paidAt,
      amount: e.amount,
      type: 'EXPENSE' as const,
      status: 'PAID' as const,
      statusLabel: 'Egreso',
      pdf: false,
    }));
    return [...income, ...out].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  });

  readonly periodRuns = computed(() => this.runs().filter((r) => r.period === this.employee().period));
  readonly periodTotals = computed(() => {
    const rows = this.periodRuns();
    const sum = (f: (r: PayrollRun) => number) => rows.reduce((s, r) => s + f(r), 0);
    return {
      count: rows.length,
      earnings: sum((r) => r.result.totalEarnings),
      deductions: sum((r) => r.result.totalDeductions),
      net: sum((r) => r.result.net),
      employer: sum((r) => r.result.pilaEmployer),
      employee: sum((r) => r.result.pilaEmployee),
      cost: sum((r) => r.result.employerCost),
    };
  });
  /** Planilla consolidada del periodo por subsistema. */
  readonly periodPila = computed(() => {
    const map = new Map<string, { label: string; employer: number; employee: number }>();
    for (const run of this.periodRuns()) {
      for (const l of run.result.pila) {
        const label = l.key === 'arl' ? 'ARL' : l.label;
        const row = map.get(l.key) ?? { label, employer: 0, employee: 0 };
        row.employer += l.employer;
        row.employee += l.employee;
        map.set(l.key, row);
      }
    }
    return [...map.values()];
  });
  readonly noveltyCounts = computed(() => {
    const list = this.novelties();
    const count = (...types: NoveltyType[]) => list.filter((n) => types.includes(n.type)).length;
    return [
      { type: 'INGRESO' as const, label: 'Ingresos', icon: 'userPlus', value: count('INGRESO') },
      { type: 'VACACIONES' as const, label: 'Vacaciones', icon: 'calendar', value: count('VACACIONES') },
      { type: 'INCAPACIDAD' as const, label: 'Incapacidades médicas', icon: 'activity', value: count('INCAPACIDAD') },
      { type: 'LICENCIA_REM' as const, label: 'Licencias remuneradas', icon: 'check', value: count('LICENCIA_REM') },
      { type: 'LICENCIA_NO_REM' as const, label: 'Licencias no remuneradas', icon: 'clock', value: count('LICENCIA_NO_REM') },
      { type: 'RETIRO' as const, label: 'Retiros', icon: 'logout', value: count('RETIRO') },
    ];
  });
  /** Estado de la planilla del periodo: lista cuando todas las liquidaciones están hechas. */
  readonly pilaStatus = computed(() => {
    const rows = this.periodRuns();
    if (!rows.length) return { label: 'Sin liquidaciones', tone: 'gray' };
    if (rows.some((r) => r.status === 'PENDIENTE')) return { label: 'Con pagos pendientes', tone: 'amber' };
    return { label: 'Lista para pagar', tone: 'mint' };
  });
  readonly employeeNames = computed(() => [...new Set(this.runs().map((r) => r.name))]);

  readonly incomeDocs = computed(() => this.docs().filter((r) => r.type === 'INCOME'));
  readonly pending = computed(() => this.docs().filter((r) => r.status === 'PENDING'));
  readonly receivable = computed(() => this.pending().reduce((s, r) => s + r.amount, 0));
  /** Envejecimiento de cartera según la fecha de emisión de la cuenta de cobro. */
  readonly aging = computed(() => {
    const buckets = [
      { label: '0–30 días', value: 0, count: 0 },
      { label: '31–60 días', value: 0, count: 0 },
      { label: '61–90 días', value: 0, count: 0 },
      { label: 'Más de 90', value: 0, count: 0 },
    ];
    const now = Date.now();
    for (const r of this.pending()) {
      const days = Math.floor((now - new Date(r.issuedAt).getTime()) / 86_400_000);
      const i = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
      buckets[i].value += r.amount;
      buckets[i].count += 1;
    }
    const max = Math.max(1, ...buckets.map((b) => b.value));
    return buckets.map((b) => ({ ...b, height: b.value > 0 ? Math.max(6, Math.round((b.value / max) * 100)) : 0 }));
  });
  /** Cartera con más de 60 días desde la emisión. */
  readonly overdue60 = computed(() =>
    this.aging()
      .slice(2)
      .reduce((s, b) => ({ value: s.value + b.value, count: s.count + b.count }), { value: 0, count: 0 }),
  );
  /** Consultorios con mayor saldo pendiente, con su último pago y el periodo de arrendamiento más antiguo sin pagar. */
  readonly topDebtors = computed(() => {
    const lastPaid = new Map<string, string>();
    for (const r of this.receipts()) {
      if (r.status === 'PAID' && r.paidAt && (!lastPaid.has(r.clinicId) || r.paidAt > lastPaid.get(r.clinicId)!)) {
        lastPaid.set(r.clinicId, r.paidAt);
      }
    }
    const map = new Map<
      string,
      { clinicId: string; name: string; amount: number; count: number; lastPaidAt: string | null; hostingPeriod: string | null }
    >();
    for (const r of this.receipts().filter((x) => x.status === 'PENDING')) {
      const name = r.clinic?.name || r.payerName || 'Sin consultorio';
      const row = map.get(r.clinicId) ?? {
        clinicId: r.clinicId, name, amount: 0, count: 0, lastPaidAt: lastPaid.get(r.clinicId) ?? null, hostingPeriod: null,
      };
      row.amount += r.amount;
      row.count += 1;
      if (r.kind === 'MONTHLY_HOSTING' && r.periodMonth && (!row.hostingPeriod || r.periodMonth < row.hostingPeriod)) {
        row.hostingPeriod = r.periodMonth;
      }
      map.set(r.clinicId, row);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 5);
  });
  /** Cifras principales del mes y del año según el modo (plataforma o consultorio). */
  readonly kpi = computed(() => {
    if (this.isClinic) {
      const m = this.summaryMonth();
      const p = this.summaryPrev();
      const y = this.summaryYear();
      const monthIncome = m?.income ?? 0;
      return {
        monthIncome,
        monthExpense: m?.expense ?? 0,
        monthNet: m?.net ?? 0,
        yearIncome: y?.income ?? 0,
        yearNet: y?.net ?? 0,
        variation: p?.income ? Math.round(((monthIncome - p.income) / p.income) * 100) : null,
      };
    }
    const inc = this.income();
    let variation: number | null = null;
    if (inc) {
      const i = inc.months.findIndex((m) => m.month === inc.currentMonth.month);
      const prev = i > 0 ? inc.months[i - 1].total : 0;
      if (prev) variation = Math.round(((inc.currentMonth.total - prev) / prev) * 100);
    }
    return {
      monthIncome: inc?.currentMonth.total ?? 0,
      monthExpense: 0,
      monthNet: inc?.currentMonth.total ?? 0,
      yearIncome: inc?.yearTotal ?? 0,
      yearNet: inc?.yearTotal ?? 0,
      variation,
    };
  });
  /** Variación del recaudo del mes frente al mes anterior. */
  readonly monthVariation = computed(() => this.kpi().variation);
  /** Barras de ingresos frente a egresos del mes (consultorio). */
  readonly cashFlow = computed(() => {
    const { monthIncome, monthExpense } = this.kpi();
    const max = Math.max(1, monthIncome, monthExpense);
    const h = (v: number) => (v > 0 ? Math.max(6, Math.round((v / max) * 100)) : 0);
    return [
      { label: 'Ingresos', value: monthIncome, height: h(monthIncome), tone: 'in' },
      { label: 'Egresos', value: monthExpense, height: h(monthExpense), tone: 'out' },
    ];
  });

  // Filtros de movimientos.
  readonly movFrom = signal('');
  readonly movTo = signal('');
  readonly movStatus = signal<'' | 'PAID' | 'PENDING'>('');
  readonly movType = signal<'' | 'INCOME' | 'EXPENSE'>('');
  readonly movClinic = signal('');
  readonly movClinics = computed(() => {
    const map = new Map<string, string>();
    for (const r of this.docs()) if (r.partyId) map.set(r.partyId, r.party);
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });
  readonly movements = computed(() => {
    const from = this.movFrom();
    const to = this.movTo();
    const status = this.movStatus();
    const type = this.movType();
    const clinic = this.movClinic();
    return this.docs().filter((r) => {
      const day = r.issuedAt ? ymd(new Date(r.paidAt || r.issuedAt)) : '';
      return (
        (!from || day >= from) &&
        (!to || day <= to) &&
        (!status || r.status === status) &&
        (!type || r.type === type) &&
        (!clinic || r.partyId === clinic)
      );
    });
  });
  readonly busyDebtor = signal<string | null>(null);
  readonly monthReceipts = computed(() => {
    const ym = ymd(new Date()).slice(0, 7);
    const rows = this.docs().filter((r) => r.type === 'INCOME' && r.issuedAt && monthKey(r.issuedAt) === ym);
    return {
      total: rows.length,
      paid: rows.filter((r) => r.status === 'PAID').length,
      pending: rows.filter((r) => r.status === 'PENDING').length,
    };
  });
  readonly rips = computed(() => {
    const active = this.clinics().filter((c) => c.isActive);
    const enabled = active.filter((c) => c.ripsEnabled).length;
    return { active: active.length, enabled, pct: active.length ? Math.round((enabled / active.length) * 100) : 0 };
  });

  ngOnInit() {
    this.loadPlatformData();
  }

  loadPlatformData() {
    if (this.isClinic) {
      this.loadClinicData();
      return;
    }
    this.loading.set(true);
    this.loadError.set('');
    let pendingCalls = 3;
    const done = () => {
      pendingCalls -= 1;
      if (pendingCalls === 0) this.loading.set(false);
    };
    const fail = () => {
      this.loadError.set('No se pudieron cargar los datos de facturación y cartera.');
      done();
    };
    this.billingApi.listReceipts().subscribe({ next: (rows) => (this.receipts.set(rows), done()), error: fail });
    this.billingApi.monthlyIncome(new Date().getFullYear()).subscribe({ next: (r) => (this.income.set(r), done()), error: fail });
    this.adminApi.listClinics().subscribe({ next: (rows) => (this.clinics.set(rows), done()), error: fail });
  }

  /** Recibos, gastos, nómina e inventario del consultorio. */
  private loadClinicData() {
    this.loading.set(true);
    this.loadError.set('');
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const listFrom = ymd(new Date(y, m - 2, 1));
    let pendingCalls = 9;
    const done = () => {
      pendingCalls -= 1;
      if (pendingCalls === 0) this.loading.set(false);
    };
    const fail = (msg = 'No se pudieron cargar los datos de Operación y Finanzas del consultorio.') => {
      this.loadError.set(msg);
      done();
    };
    const api = this.clinicBilling;
    const fin = this.financeApi;
    api.listReceipts(listFrom).subscribe({ next: (rows) => (this.clinicReceipts.set(rows), done()), error: () => fail() });
    api.listExpenses(listFrom).subscribe({ next: (rows) => (this.expenses.set(rows), done()), error: () => fail() });
    api.summary(ymd(new Date(y, m, 1)), ymd(now)).subscribe({ next: (s) => (this.summaryMonth.set(s), done()), error: () => fail() });
    api
      .summary(ymd(new Date(y, m - 1, 1)), ymd(new Date(y, m, 0)))
      .subscribe({ next: (s) => (this.summaryPrev.set(s), done()), error: () => fail() });
    api.summary(ymd(new Date(y, 0, 1)), ymd(now)).subscribe({ next: (s) => (this.summaryYear.set(s), done()), error: () => fail() });
    fin.getPayrollSettings().subscribe({
      next: (s) => {
        this.params.set({ smmlv: s.smmlv, transportAid: s.transportAid, exempt114: s.exempt114 });
        done();
      },
      error: () => fail('No se pudieron cargar los parámetros de nómina.'),
    });
    fin.listPayrollRuns().subscribe({
      next: (rows) => {
        this.runs.set(
          rows.map((r) => ({
            id: r.id,
            name: r.name,
            idNumber: r.idNumber,
            role: r.role,
            department: r.department,
            period: r.period,
            payDate: r.payDate || today(),
            status: r.status,
            input: r.input,
            result: r.result,
          })),
        );
        done();
      },
      error: () => fail('No se pudieron cargar las liquidaciones de nómina.'),
    });
    fin.listNovelties().subscribe({
      next: (rows) => {
        this.novelties.set(rows.map((n) => ({ id: n.id, employee: n.employee, type: n.type, from: n.from, to: n.to, notes: n.notes })));
        done();
      },
      error: () => fail('No se pudieron cargar las novedades de nómina.'),
    });
    this.reloadInventory(done, () => fail('No se pudo cargar el inventario.'));
  }

  private reloadInventory(done?: () => void, fail?: () => void) {
    let left = 2;
    const step = () => {
      left -= 1;
      if (left === 0) done?.();
    };
    const onFail = () => {
      fail?.();
      step();
    };
    this.financeApi.listSupplyItems().subscribe({
      next: (rows) => {
        this.supplyItems.set(rows);
        step();
      },
      error: onFail,
    });
    this.financeApi.inventorySummary().subscribe({
      next: (s) => {
        this.inventorySummary.set(s);
        step();
      },
      error: onFail,
    });
  }

  go(section: Section) {
    this.section.set(section);
    this.navOpen.set(false);
    this.notice.set('');
    if (section === 'reportes') this.payrollTab.set('reportes');
  }

  patchEmployee<K extends keyof EmployeeForm>(key: K, value: EmployeeForm[K]) {
    this.employee.update((e) => ({ ...e, [key]: value }));
    if (key === 'name') {
      const prev = [...this.runs()].reverse().find((r) => r.name === value);
      if (prev) {
        this.employee.update((e) => ({ ...e, idNumber: prev.idNumber, role: prev.role, department: prev.department }));
      }
    }
  }

  patchInput<K extends keyof PayrollInput>(key: K, value: PayrollInput[K]) {
    const v = key === 'arlClass' ? (Number(value) as ArlClass) : Number(value) || 0;
    this.input.update((i) => ({ ...i, [key]: v }));
  }

  patchParams<K extends keyof PayrollParams>(key: K, value: PayrollParams[K]) {
    this.params.update((p) => ({ ...p, [key]: typeof value === 'boolean' ? value : Number(value) || 0 }));
  }

  /** Guarda en el servidor los parámetros de la calculadora (solo consultorio). */
  saveParams() {
    if (!this.isClinic) {
      this.notice.set('Parámetros actualizados en esta sesión.');
      return;
    }
    this.saving.set(true);
    this.financeApi.savePayrollSettings(this.params()).subscribe({
      next: () => {
        this.saving.set(false);
        this.notice.set('Parámetros de nómina guardados.');
      },
      error: (err) => {
        this.saving.set(false);
        this.loadError.set(err?.error?.message || 'No se pudieron guardar los parámetros.');
      },
    });
  }

  /** Agrega o reemplaza la liquidación del empleado en el periodo y muestra la planilla. */
  generate() {
    const emp = this.employee();
    this.formError.set('');
    if (!emp.name.trim()) return this.formError.set('Escriba el nombre del empleado.');
    if (!emp.idNumber.trim()) return this.formError.set('Escriba la identificación del empleado.');
    if (!(this.input().salary > 0)) return this.formError.set('Indique el salario básico mensual.');
    if (!(this.input().days > 0)) return this.formError.set('Los días trabajados deben ser entre 1 y 30.');

    const draft: PayrollRun = {
      ...emp,
      name: emp.name.trim(),
      idNumber: emp.idNumber.trim(),
      id: `${emp.idNumber.trim()}|${emp.period}`,
      status: 'LIQUIDADO',
      input: { ...this.input() },
      result: this.result(),
    };

    if (!this.isClinic) {
      const exists = this.runs().some((r) => r.id === draft.id);
      this.runs.update((rows) => (exists ? rows.map((r) => (r.id === draft.id ? draft : r)) : [...rows, draft]));
      this.payrollTab.set('pila');
      this.notice.set(
        `${exists ? 'Liquidación actualizada' : 'Liquidación agregada'}: ${draft.name}, ${this.monthLabel(draft.period)}. Neto a pagar ${this.cop(draft.result.net)}.`,
      );
      return;
    }

    this.saving.set(true);
    this.financeApi
      .upsertPayrollRun({
        period: draft.period,
        employeeName: draft.name,
        idNumber: draft.idNumber,
        role: draft.role,
        department: draft.department,
        payDate: draft.payDate,
        status: draft.status,
        input: draft.input,
        result: draft.result,
      })
      .subscribe({
        next: (saved) => {
          const run: PayrollRun = {
            id: saved.id,
            name: saved.name,
            idNumber: saved.idNumber,
            role: saved.role,
            department: saved.department,
            period: saved.period,
            payDate: saved.payDate || today(),
            status: saved.status,
            input: saved.input,
            result: saved.result,
          };
          this.runs.update((rows) => {
            const i = rows.findIndex((r) => r.id === run.id || (r.idNumber === run.idNumber && r.period === run.period));
            return i >= 0 ? rows.map((r, idx) => (idx === i ? run : r)) : [...rows, run];
          });
          this.saving.set(false);
          this.payrollTab.set('pila');
          this.notice.set(
            `Liquidación guardada: ${run.name}, ${this.monthLabel(run.period)}. Neto a pagar ${this.cop(run.result.net)}.`,
          );
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(err?.error?.message || 'No se pudo guardar la liquidación.');
        },
      });
  }

  newLiquidation() {
    this.employee.update((e) => ({ ...e, name: '', idNumber: '', role: '', department: '' }));
    this.input.set(emptyInput());
    this.formError.set('');
    this.payrollTab.set('liquidacion');
  }

  loadRun(run: PayrollRun) {
    const { id: _id, status: _s, input, result: _r, ...emp } = run;
    this.employee.set(emp);
    this.input.set({ ...input });
    this.section.set('nomina');
    this.payrollTab.set('liquidacion');
    this.navOpen.set(false);
  }

  setStatus(run: PayrollRun, status: PayStatus) {
    if (!this.isClinic) {
      this.runs.update((rows) => rows.map((r) => (r.id === run.id ? { ...r, status } : r)));
      return;
    }
    this.financeApi.updatePayrollRunStatus(run.id, status).subscribe({
      next: (saved) => {
        this.runs.update((rows) => rows.map((r) => (r.id === run.id ? { ...r, status: saved.status } : r)));
        this.notice.set(`Estado de ${run.name}: ${this.statusLabels[saved.status]}.`);
      },
      error: (err) => this.loadError.set(err?.error?.message || 'No se pudo actualizar el estado.'),
    });
  }

  removeRun(run: PayrollRun) {
    if (!window.confirm(`¿Quitar la liquidación de ${run.name} del periodo ${this.monthLabel(run.period)}?`)) return;
    if (!this.isClinic) {
      this.runs.update((rows) => rows.filter((r) => r.id !== run.id));
      return;
    }
    this.financeApi.deletePayrollRun(run.id).subscribe({
      next: () => {
        this.runs.update((rows) => rows.filter((r) => r.id !== run.id));
        this.notice.set(`Liquidación de ${run.name} eliminada.`);
      },
      error: (err) => this.loadError.set(err?.error?.message || 'No se pudo eliminar la liquidación.'),
    });
  }

  addNovelty() {
    const f = this.noveltyForm;
    if (!f.employee.trim()) return this.formError.set('Escriba el empleado de la novedad.');
    if (f.to && f.from && f.to < f.from) return this.formError.set('La fecha final no puede ser anterior a la inicial.');
    this.formError.set('');
    const payload = { employee: f.employee.trim(), type: f.type, from: f.from, to: f.to, notes: f.notes };
    if (!this.isClinic) {
      this.novelties.update((rows) => [{ ...payload, id: crypto.randomUUID() }, ...rows]);
      this.noveltyForm = { employee: '', type: f.type, from: today(), to: today(), notes: '' };
      return;
    }
    this.financeApi.createNovelty(payload).subscribe({
      next: (n) => {
        this.novelties.update((rows) => [
          { id: n.id, employee: n.employee, type: n.type, from: n.from, to: n.to, notes: n.notes },
          ...rows,
        ]);
        this.noveltyForm = { employee: '', type: f.type, from: today(), to: today(), notes: '' };
        this.notice.set(`Novedad registrada: ${this.noveltyLabel(n.type)} · ${n.employee}.`);
      },
      error: (err) => this.formError.set(err?.error?.message || 'No se pudo registrar la novedad.'),
    });
  }

  removeNovelty(n: Novelty) {
    if (!this.isClinic) {
      this.novelties.update((rows) => rows.filter((r) => r.id !== n.id));
      return;
    }
    this.financeApi.deleteNovelty(n.id).subscribe({
      next: () => this.novelties.update((rows) => rows.filter((r) => r.id !== n.id)),
      error: (err) => this.loadError.set(err?.error?.message || 'No se pudo eliminar la novedad.'),
    });
  }

  createSupply() {
    const f = this.supplyForm;
    if (!f.name.trim()) return this.formError.set('Escriba el nombre del insumo.');
    if (!this.isClinic) return this.formError.set('El inventario solo se guarda en el consultorio.');
    this.formError.set('');
    this.saving.set(true);
    this.financeApi
      .createSupplyItem({
        name: f.name.trim(),
        sku: f.sku.trim() || undefined,
        unit: f.unit.trim() || 'und',
        category: f.category,
        unitCost: Number(f.unitCost) || 0,
        minStock: Number(f.minStock) || 0,
        initialQuantity: Number(f.initialQuantity) || 0,
        lotNumber: f.lotNumber.trim() || undefined,
        notes: f.notes.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.supplyForm = {
            name: '', sku: '', unit: 'und', category: 'CONSUMABLE', unitCost: 0, minStock: 0, initialQuantity: 0, lotNumber: '', notes: '',
          };
          this.notice.set('Insumo registrado en el inventario.');
          this.reloadInventory();
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(err?.error?.message || 'No se pudo registrar el insumo.');
        },
      });
  }

  registerMovement() {
    const f = this.movementForm;
    if (!f.itemId) return this.formError.set('Elija el insumo.');
    if (!(f.quantity > 0) && f.type !== 'ADJUST') return this.formError.set('Indique la cantidad.');
    if (!this.isClinic) return;
    this.formError.set('');
    this.saving.set(true);
    this.financeApi
      .createSupplyMovement(f.itemId, {
        type: f.type,
        quantity: Number(f.quantity) || 0,
        notes: f.notes.trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.movementForm = { itemId: f.itemId, type: f.type, quantity: 1, notes: '' };
          this.notice.set('Movimiento de inventario registrado.');
          this.reloadInventory();
        },
        error: (err) => {
          this.saving.set(false);
          this.formError.set(err?.error?.message || 'No se pudo registrar el movimiento.');
        },
      });
  }

  removeSupply(item: FinanceSupplyItem) {
    if (!window.confirm(`¿Eliminar el insumo «${item.name}» y su historial de movimientos?`)) return;
    this.financeApi.deleteSupplyItem(item.id).subscribe({
      next: () => {
        this.notice.set(`Insumo «${item.name}» eliminado.`);
        this.reloadInventory();
      },
      error: (err) => this.loadError.set(err?.error?.message || 'No se pudo eliminar el insumo.'),
    });
  }

  /** Abre el formulario de novedades con el tipo ya elegido. */
  quickNovelty(type: NoveltyType) {
    this.noveltyForm = { ...this.noveltyForm, type };
    this.section.set('nomina');
    this.payrollTab.set('novedades');
    this.formError.set('');
    this.navOpen.set(false);
  }

  /** Envía al admin del consultorio el aviso de mora del arrendamiento pendiente más antiguo. */
  notifyDebtor(d: { clinicId: string; name: string; hostingPeriod: string | null }) {
    if (!d.hostingPeriod) return;
    const ok = window.confirm(
      `Se enviará al administrador de ${d.name} el aviso de mora del arrendamiento ${this.monthLabel(d.hostingPeriod)}. ¿Continuar?`,
    );
    if (!ok) return;
    this.busyDebtor.set(d.clinicId);
    this.loadError.set('');
    this.billingApi.notifyHostingDue({ periodMonth: d.hostingPeriod, clinicId: d.clinicId }).subscribe({
      next: (res) => {
        this.busyDebtor.set(null);
        this.notice.set(
          res.count
            ? `Aviso de cobro enviado a ${d.name} (${this.monthLabel(d.hostingPeriod!)}).`
            : `No se envió aviso: ${d.name} no tiene arrendamiento pendiente en ${this.monthLabel(d.hostingPeriod!)}.`,
        );
      },
      error: (err) => {
        this.busyDebtor.set(null);
        this.loadError.set(err?.error?.message || 'No se pudo enviar el aviso de cobro.');
      },
    });
  }

  openPdf(id: string) {
    const token = this.auth.token();
    const url = this.isClinic ? this.clinicBilling.receiptPdfUrl(id) : this.billingApi.receiptPdfUrl(id);
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.blob();
      })
      .then((blob) => window.open(URL.createObjectURL(blob), '_blank'))
      .catch(() => this.loadError.set('No se pudo abrir el PDF del recibo.'));
  }

  clearMovementFilters() {
    this.movFrom.set('');
    this.movTo.set('');
    this.movStatus.set('');
    this.movType.set('');
    this.movClinic.set('');
  }

  /** Descarga los movimientos filtrados como CSV (se abre en Excel). */
  exportMovementsCsv() {
    const rows = this.movements();
    if (!rows.length) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const header = ['Número', this.partyLabel, 'Concepto', 'Fecha', 'Tipo', 'Valor', 'Estado'];
    const lines = rows.map((r) =>
      [
        r.number, r.party, r.concept, r.issuedAt ? ymd(new Date(r.issuedAt)) : '',
        r.type === 'INCOME' ? 'Ingreso' : 'Egreso', r.amount, r.statusLabel,
      ]
        .map(esc)
        .join(';'),
    );
    this.download(`movimientos-${today()}.csv`, [header.map(esc).join(';'), ...lines]);
  }

  initials(name: string) {
    const parts = (name || '').trim().split(/\s+/);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '—';
  }

  private download(filename: string, lines: string[]) {
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  noveltyLabel(type: NoveltyType) {
    return this.noveltyTypes.find((t) => t.value === type)?.label ?? type;
  }

  /** Descarga el resumen del periodo como CSV (se genera en el navegador). */
  exportCsv() {
    const rows = this.periodRuns();
    if (!rows.length) return;
    const header = [
      'Nombre', 'Identificación', 'Cargo', 'Departamento', 'Periodo', 'Fecha de pago', 'Estado',
      'Salario', 'IBC', 'Devengado', 'Deducciones', 'Neto a pagar', 'Aportes empresa', 'Aportes trabajador',
    ];
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = rows.map((r) =>
      [
        r.name, r.idNumber, r.role, r.department, r.period, r.payDate, this.statusLabels[r.status],
        r.input.salary, r.result.ibc, r.result.totalEarnings, r.result.totalDeductions, r.result.net,
        r.result.pilaEmployer, r.result.pilaEmployee,
      ]
        .map(esc)
        .join(';'),
    );
    this.download(`nomina-${this.employee().period}.csv`, [header.map(esc).join(';'), ...lines]);
  }

  onBeforeUnload(event: BeforeUnloadEvent) {
    // En el consultorio los datos ya están en el servidor; solo avisa en el panel del superadmin.
    if (!this.isClinic && (this.runs().length || this.novelties().length)) event.preventDefault();
  }

  cop(n: number) {
    return COP.format(Math.round(n || 0));
  }

  pct(n: number) {
    return `${n.toLocaleString('es-CO', { maximumFractionDigits: 3 })} %`;
  }

  monthLabel(ym: string) {
    const [y, m] = (ym || '').split('-').map(Number);
    return y && m ? `${MONTHS[m - 1]} ${y}` : '';
  }
}
