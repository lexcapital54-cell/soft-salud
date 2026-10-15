import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminApiService } from '../admin-api.service';
import { AuthService } from '../auth.service';
import { HabIcon } from '../habilitation/hab-icon';
import { Clinic } from '../models';
import {
  MonthlyIncomeReport,
  PlatformBillingApiService,
  PlatformReceipt,
} from '../platform-billing/platform-billing-api.service';
import { ARL_RATES, ArlClass, PayrollInput, PayrollParams, PayrollResult, calcPayroll } from './payroll-calc';

type Section = 'dashboard' | 'empleados' | 'facturacion' | 'tesoreria' | 'nomina' | 'inventarios' | 'reportes' | 'config';
type PayrollTab = 'liquidacion' | 'pila' | 'novedades' | 'reportes';
type PayStatus = 'LIQUIDADO' | 'PAGADO' | 'PENDIENTE';
type NoveltyType = 'INGRESO' | 'VACACIONES' | 'INCAPACIDAD' | 'LICENCIA_REM' | 'LICENCIA_NO_REM' | 'RETIRO';

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
 * Operación y Finanzas: nómina y PILA (calculadora de referencia), facturación, tesorería
 * y cartera con los cobros reales de la plataforma, e inventario.
 * Las liquidaciones y novedades viven solo en memoria: no se guardan en el servidor ni en el navegador.
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
      subtitle: 'Cobros emitidos por la plataforma, estado de pago y activación de RIPS por consultorio.',
    },
    {
      id: 'tesoreria', num: '06', label: 'Tesorería y Cartera', icon: 'scale',
      subtitle: 'Recaudos, cuentas de cobro pendientes y envejecimiento de cartera por consultorio.',
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

  readonly notice = signal('');
  readonly formError = signal('');

  // Datos reales de la plataforma (cobros a los consultorios).
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly receipts = signal<PlatformReceipt[]>([]);
  readonly income = signal<MonthlyIncomeReport | null>(null);
  readonly clinics = signal<Clinic[]>([]);

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

  readonly pending = computed(() => this.receipts().filter((r) => r.status === 'PENDING'));
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
      const days = Math.floor((now - new Date(r.createdAt).getTime()) / 86_400_000);
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
    for (const r of this.pending()) {
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
  /** Variación del recaudo del mes frente al mes anterior (mismo año). */
  readonly monthVariation = computed(() => {
    const inc = this.income();
    if (!inc) return null;
    const i = inc.months.findIndex((m) => m.month === inc.currentMonth.month);
    if (i <= 0) return null;
    const prev = inc.months[i - 1].total;
    if (!prev) return null;
    return Math.round(((inc.currentMonth.total - prev) / prev) * 100);
  });

  // Filtros de movimientos (cobros de la plataforma).
  readonly movFrom = signal('');
  readonly movTo = signal('');
  readonly movStatus = signal<'' | 'PAID' | 'PENDING'>('');
  readonly movClinic = signal('');
  readonly movClinics = computed(() => {
    const map = new Map<string, string>();
    for (const r of this.receipts()) map.set(r.clinicId, r.clinic?.name || r.payerName || 'Sin consultorio');
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  });
  readonly movements = computed(() => {
    const from = this.movFrom();
    const to = this.movTo();
    const status = this.movStatus();
    const clinic = this.movClinic();
    return this.receipts().filter((r) => {
      const day = (r.paidAt || r.createdAt).slice(0, 10);
      return (!from || day >= from) && (!to || day <= to) && (!status || r.status === status) && (!clinic || r.clinicId === clinic);
    });
  });
  readonly busyDebtor = signal<string | null>(null);
  readonly monthReceipts = computed(() => {
    const ym = new Date().toISOString().slice(0, 7);
    const rows = this.receipts().filter((r) => r.createdAt.slice(0, 7) === ym);
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

  /** Agrega o reemplaza la liquidación del empleado en el periodo y muestra la planilla. */
  generate() {
    const emp = this.employee();
    this.formError.set('');
    if (!emp.name.trim()) return this.formError.set('Escriba el nombre del empleado.');
    if (!emp.idNumber.trim()) return this.formError.set('Escriba la identificación del empleado.');
    if (!(this.input().salary > 0)) return this.formError.set('Indique el salario básico mensual.');
    if (!(this.input().days > 0)) return this.formError.set('Los días trabajados deben ser entre 1 y 30.');

    const run: PayrollRun = {
      ...emp,
      name: emp.name.trim(),
      idNumber: emp.idNumber.trim(),
      id: `${emp.idNumber.trim()}|${emp.period}`,
      status: 'LIQUIDADO',
      input: { ...this.input() },
      result: this.result(),
    };
    const exists = this.runs().some((r) => r.id === run.id);
    this.runs.update((rows) => (exists ? rows.map((r) => (r.id === run.id ? run : r)) : [...rows, run]));
    this.payrollTab.set('pila');
    this.notice.set(
      `${exists ? 'Liquidación actualizada' : 'Liquidación agregada'}: ${run.name}, ${this.monthLabel(run.period)}. Neto a pagar ${this.cop(run.result.net)}.`,
    );
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
    this.runs.update((rows) => rows.map((r) => (r.id === run.id ? { ...r, status } : r)));
  }

  removeRun(run: PayrollRun) {
    if (!window.confirm(`¿Quitar la liquidación de ${run.name} del periodo ${this.monthLabel(run.period)}?`)) return;
    this.runs.update((rows) => rows.filter((r) => r.id !== run.id));
  }

  addNovelty() {
    const f = this.noveltyForm;
    if (!f.employee.trim()) return this.formError.set('Escriba el empleado de la novedad.');
    if (f.to && f.from && f.to < f.from) return this.formError.set('La fecha final no puede ser anterior a la inicial.');
    this.formError.set('');
    this.novelties.update((rows) => [{ ...f, employee: f.employee.trim(), id: crypto.randomUUID() }, ...rows]);
    this.noveltyForm = { employee: '', type: f.type, from: today(), to: today(), notes: '' };
  }

  removeNovelty(n: Novelty) {
    this.novelties.update((rows) => rows.filter((r) => r.id !== n.id));
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
    fetch(this.billingApi.receiptPdfUrl(id), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.blob();
      })
      .then((blob) => window.open(URL.createObjectURL(blob), '_blank'))
      .catch(() => this.loadError.set('No se pudo abrir el PDF del cobro.'));
  }

  clearMovementFilters() {
    this.movFrom.set('');
    this.movTo.set('');
    this.movStatus.set('');
    this.movClinic.set('');
  }

  /** Descarga los movimientos filtrados como CSV (se abre en Excel). */
  exportMovementsCsv() {
    const rows = this.movements();
    if (!rows.length) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const header = ['Número', 'Consultorio', 'Concepto', 'Emitido', 'Pagado', 'Medio de pago', 'Monto', 'Estado'];
    const lines = rows.map((r) =>
      [
        r.number, r.clinic?.name || r.payerName || '', r.kindLabel, r.createdAt.slice(0, 10), r.paidAt?.slice(0, 10) || '',
        r.methodLabel, r.amount, r.statusLabel,
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
    if (this.runs().length || this.novelties().length) event.preventDefault();
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
