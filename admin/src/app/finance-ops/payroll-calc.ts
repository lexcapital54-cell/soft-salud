/**
 * Cálculo de referencia de nómina y aportes PILA (Colombia).
 * Es una herramienta de apoyo: el resultado debe validarlo el contador antes de pagar.
 */

export type ArlClass = 1 | 2 | 3 | 4 | 5;

/** Tarifas ARL por clase de riesgo (Decreto 1772 de 1994), en porcentaje. */
export const ARL_RATES: Record<ArlClass, { label: string; rate: number }> = {
  1: { label: 'Clase I · Riesgo mínimo', rate: 0.522 },
  2: { label: 'Clase II · Riesgo bajo', rate: 1.044 },
  3: { label: 'Clase III · Riesgo medio', rate: 2.436 },
  4: { label: 'Clase IV · Riesgo alto', rate: 4.35 },
  5: { label: 'Clase V · Riesgo máximo', rate: 6.96 },
};

export interface PayrollParams {
  /** Salario mínimo mensual legal vigente. */
  smmlv: number;
  /** Auxilio de transporte mensual vigente. */
  transportAid: number;
  /** Exoneración del art. 114-1 del Estatuto Tributario (salud empresa, SENA e ICBF). */
  exempt114: boolean;
}

export interface PayrollInput {
  salary: number;
  days: number;
  overtime: number;
  commissions: number;
  bonusSalary: number;
  bonusNonSalary: number;
  sickPay: number;
  withholding: number;
  otherDeductions: number;
  arlClass: ArlClass;
}

export interface PilaLine {
  key: string;
  label: string;
  /** Porcentaje total sobre el IBC. */
  totalRate: number;
  employerRate: number;
  employeeRate: number;
  employer: number;
  employee: number;
  note?: string;
}

export interface PayrollResult {
  basic: number;
  transport: number;
  earnings: Array<{ label: string; value: number }>;
  totalEarnings: number;
  ibc: number;
  ibcAdjusted: '' | 'min' | 'max';
  deductions: Array<{ label: string; value: number }>;
  totalDeductions: number;
  net: number;
  pila: PilaLine[];
  pilaEmployer: number;
  pilaEmployee: number;
  pilaTotal: number;
  /** Devengado + aportes de la empresa (sin prestaciones sociales). */
  employerCost: number;
  exempt: boolean;
}

/** Los aportes PILA se aproximan al múltiplo de 100 superior. */
const round100 = (n: number) => (n > 0 ? Math.ceil(n / 100) * 100 : 0);
const pos = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

/** Fondo de solidaridad pensional a cargo del trabajador según el IBC en SMMLV. */
function solidarityRate(ibc: number, smmlv: number): number {
  const s = ibc / smmlv;
  if (s < 4) return 0;
  if (s < 16) return 1;
  if (s < 17) return 1.2;
  if (s < 18) return 1.4;
  if (s < 19) return 1.6;
  if (s < 20) return 1.8;
  return 2;
}

export function calcPayroll(input: PayrollInput, params: PayrollParams): PayrollResult {
  const smmlv = pos(params.smmlv);
  const days = Math.min(30, Math.max(0, Math.round(pos(input.days))));
  const salary = pos(input.salary);
  const factor = days / 30;

  const basic = Math.round(salary * factor);
  const transport = smmlv > 0 && salary > 0 && salary <= 2 * smmlv ? Math.round(pos(params.transportAid) * factor) : 0;
  const overtime = pos(input.overtime);
  const commissions = pos(input.commissions);
  const bonusSalary = pos(input.bonusSalary);
  const bonusNonSalary = pos(input.bonusNonSalary);
  const sickPay = pos(input.sickPay);

  const earnings = [
    { label: 'Salario básico', value: basic },
    { label: 'Auxilio de transporte', value: transport },
    { label: 'Horas extra y recargos', value: overtime },
    { label: 'Comisiones', value: commissions },
    { label: 'Bonificaciones salariales', value: bonusSalary },
    { label: 'Bonificaciones no salariales', value: bonusNonSalary },
    { label: 'Incapacidades', value: sickPay },
  ];
  const totalEarnings = earnings.reduce((s, e) => s + e.value, 0);

  // IBC: pagos salariales + exceso de pagos no salariales sobre el 40 % (Ley 1393 de 2010).
  const salaryPay = basic + overtime + commissions + bonusSalary + sickPay;
  const excess40 = Math.max(0, bonusNonSalary - 0.4 * (salaryPay + bonusNonSalary));
  let ibc = salaryPay + excess40;
  let ibcAdjusted: PayrollResult['ibcAdjusted'] = '';
  if (ibc > 0 && smmlv > 0) {
    const min = smmlv * factor;
    const max = 25 * smmlv;
    if (ibc < min) {
      ibc = min;
      ibcAdjusted = 'min';
    } else if (ibc > max) {
      ibc = max;
      ibcAdjusted = 'max';
    }
  }
  ibc = Math.ceil(ibc);

  const exempt = params.exempt114 && smmlv > 0 && ibc < 10 * smmlv;
  const arl = ARL_RATES[input.arlClass] ?? ARL_RATES[1];
  const fsp = smmlv > 0 ? solidarityRate(ibc, smmlv) : 0;

  const line = (key: string, label: string, employerRate: number, employeeRate: number, note?: string): PilaLine => ({
    key,
    label,
    totalRate: employerRate + employeeRate,
    employerRate,
    employeeRate,
    employer: round100((ibc * employerRate) / 100),
    employee: round100((ibc * employeeRate) / 100),
    note,
  });

  const pila: PilaLine[] = [
    line('salud', 'Salud (EPS)', exempt ? 0 : 8.5, 4, exempt ? 'Empresa exonerada (art. 114-1 E.T.)' : undefined),
    line('pension', 'Pensión (AFP)', 12, 4),
    ...(fsp > 0 ? [line('fsp', 'Fondo de solidaridad pensional', 0, fsp, 'IBC igual o superior a 4 SMMLV')] : []),
    line('arl', `ARL (${arl.label})`, arl.rate, 0),
    line('ccf', 'Caja de compensación', 4, 0),
    line('sena', 'SENA', exempt ? 0 : 2, 0, exempt ? 'Exonerado' : undefined),
    line('icbf', 'ICBF', exempt ? 0 : 3, 0, exempt ? 'Exonerado' : undefined),
  ];
  const pilaEmployer = pila.reduce((s, l) => s + l.employer, 0);
  const pilaEmployee = pila.reduce((s, l) => s + l.employee, 0);

  const health = pila.find((l) => l.key === 'salud')?.employee ?? 0;
  const pension = pila.find((l) => l.key === 'pension')?.employee ?? 0;
  const solidarity = pila.find((l) => l.key === 'fsp')?.employee ?? 0;
  const deductions = [
    { label: 'Salud (4 %)', value: health },
    { label: 'Pensión (4 %)', value: pension },
    ...(solidarity > 0 ? [{ label: `Fondo de solidaridad (${fsp} %)`, value: solidarity }] : []),
    { label: 'Retención en la fuente', value: pos(input.withholding) },
    { label: 'Otras deducciones', value: pos(input.otherDeductions) },
  ];
  const totalDeductions = deductions.reduce((s, d) => s + d.value, 0);

  return {
    basic,
    transport,
    earnings,
    totalEarnings,
    ibc,
    ibcAdjusted,
    deductions,
    totalDeductions,
    net: totalEarnings - totalDeductions,
    pila,
    pilaEmployer,
    pilaEmployee,
    pilaTotal: pilaEmployer + pilaEmployee,
    employerCost: totalEarnings + pilaEmployer,
    exempt,
  };
}
