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
type NoveltyType = 'INGRESO' | 'VACACIONES' | 'INCAPACIDAD' | 'LICENCIA_REM' | 'LICENCIA_NO_REM';

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

  readonly sections: Array<{ id: Section; num: string; label: string; icon: string }> = [
    { id: 'dashboard', num: '01', label: 'Dashboard', icon: 'dashboard' },
    { id: 'empleados', num: '02', label: 'Empleados', icon: 'users' },
    { id: 'facturacion', num: '05', label: 'Facturación y RIPS', icon: 'receipt' },
    { id: 'tesoreria', num: '06', label: 'Tesorería y Cartera', icon: 'scale' },
    { id: 'nomina', num: '07', label: 'Nómina y PILA', icon: 'clipboard' },
    { id: 'inventarios', num: '08', label: 'Inventarios', icon: 'package' },
    { id: 'reportes', num: '', label: 'Reportes', icon: 'activity' },
    { id: 'config', num: '', label: 'Configuración', icon: 'settings' },
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
      { label: 'Ingresos', icon: 'userPlus', value: count('INGRESO') },
      { label: 'Vacaciones', icon: 'calendar', value: count('VACACIONES') },
      { label: 'Incapacidades médicas', icon: 'activity', value: count('INCAPACIDAD') },
      { label: 'Licencias remuneradas', icon: 'check', value: count('LICENCIA_REM') },
      { label: 'Licencias no remuneradas', icon: 'clock', value: count('LICENCIA_NO_REM') },
    ];
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
  readonly topDebtors = computed(() => {
    const map = new Map<string, { name: string; amount: number; count: number }>();
    for (const r of this.pending()) {
      const name = r.clinic?.name || r.payerName || 'Sin consultorio';
      const row = map.get(r.clinicId) ?? { name, amount: 0, count: 0 };
      row.amount += r.amount;
      row.count += 1;
      map.set(r.clinicId, row);
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 3);
  });
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
    const blob = new Blob(['\ufeff' + [header.map(esc).join(';'), ...lines].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nomina-${this.employee().period}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
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
