import { CiConsentDetails, CiConsentSpec } from '../consent.models';

/** Cuadrantes FDI en el orden en que se ven de frente al paciente. */
export const FDI_PERMANENT_ROWS: number[][] = [
  [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
];
export const FDI_PRIMARY_ROWS: number[][] = [
  [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
  [85, 84, 83, 82, 81, 71, 72, 73, 74, 75],
];
export const THIRD_MOLARS = [18, 28, 38, 48];

export function isCiSpec(value: unknown): value is CiConsentSpec {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { kind?: unknown }).kind === 'CI' &&
    Array.isArray((value as { risks?: unknown }).risks)
  );
}

export function emptyCiDetails(spec: CiConsentSpec): CiConsentDetails {
  return {
    code: spec.code,
    teeth: [],
    options: Object.fromEntries(spec.options.map((g) => [g.key, []])),
    risksAccepted: [],
    declarationsAccepted: [],
    notes: '',
  };
}

export function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export interface CiProgress {
  done: number;
  total: number;
  missing: string[];
}

/** Mismas reglas que la validación del servidor (ci-consent.validation.ts). */
export function ciProgress(spec: CiConsentSpec, d: CiConsentDetails): CiProgress {
  const missing: string[] = [];
  let total = 0;
  let done = 0;

  if (spec.teeth === 'required') {
    total += 1;
    if (d.teeth.length) done += 1;
    else missing.push('Dientes a intervenir');
  }
  for (const group of spec.options.filter((g) => g.required)) {
    total += 1;
    if ((d.options[group.key] ?? []).length) done += 1;
    else missing.push(group.label);
  }
  for (const risk of spec.risks) {
    total += 1;
    if (d.risksAccepted.includes(risk.key)) done += 1;
  }
  const risksLeft = spec.risks.filter((r) => !d.risksAccepted.includes(r.key)).length;
  if (risksLeft) missing.push(`${risksLeft} riesgo(s) por explicar`);
  for (const decl of spec.declarations) {
    total += 1;
    if (d.declarationsAccepted.includes(decl.key)) done += 1;
  }
  const declLeft = spec.declarations.filter(
    (x) => !d.declarationsAccepted.includes(x.key),
  ).length;
  if (declLeft) missing.push(`${declLeft} declaración(es) del paciente`);

  return { done, total, missing };
}
