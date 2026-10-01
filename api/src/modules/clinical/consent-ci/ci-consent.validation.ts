import { CiConsentDetails, CiConsentSpec } from './ci-consent.types';

const PERMANENT_TEETH = [1, 2, 3, 4].flatMap((q) =>
  [1, 2, 3, 4, 5, 6, 7, 8].map((n) => q * 10 + n),
);
const PRIMARY_TEETH = [5, 6, 7, 8].flatMap((q) =>
  [1, 2, 3, 4, 5].map((n) => q * 10 + n),
);
export const FDI_TEETH = new Set([...PERMANENT_TEETH, ...PRIMARY_TEETH]);

export type CiValidationResult =
  | { ok: true; details: CiConsentDetails }
  | { ok: false; errors: string[] };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((v): v is string => typeof v === 'string'))]
    : [];
}

/**
 * Valida y normaliza el detalle diligenciado contra la especificación del CI.
 * Descarta claves desconocidas y exige todos los riesgos y declaraciones.
 */
export function validateCiDetails(
  spec: CiConsentSpec,
  raw: unknown,
  now = new Date(),
): CiValidationResult {
  const input = asRecord(raw);
  const errors: string[] = [];

  const teeth = Array.isArray(input.teeth)
    ? [...new Set(input.teeth.map((t) => Number(t)))].sort((a, b) => a - b)
    : [];
  const invalidTeeth = teeth.filter((t) => !FDI_TEETH.has(t));
  if (invalidTeeth.length) {
    errors.push(`Dientes fuera de la nomenclatura FDI: ${invalidTeeth.join(', ')}.`);
  }
  if (spec.teeth === 'required' && !teeth.length) {
    errors.push('Indique los dientes a intervenir.');
  }

  const rawOptions = asRecord(input.options);
  const options: Record<string, string[]> = {};
  for (const group of spec.options) {
    const allowed = new Set(group.choices.map((c) => c.value));
    const picked = stringList(rawOptions[group.key]).filter((v) => allowed.has(v));
    if (!group.multiple && picked.length > 1) {
      errors.push(`«${group.label}» admite una sola opción.`);
    }
    if (group.required && !picked.length) {
      errors.push(`Seleccione «${group.label}».`);
    }
    options[group.key] = group.multiple ? picked : picked.slice(0, 1);
  }

  const risks = new Set(stringList(input.risksAccepted));
  const missingRisks = spec.risks.filter((r) => !risks.has(r.key));
  if (missingRisks.length) {
    errors.push(
      `Faltan riesgos por explicar y aceptar: ${missingRisks.map((r) => r.label).join('; ')}.`,
    );
  }

  const declarations = new Set(stringList(input.declarationsAccepted));
  const missingDeclarations = spec.declarations.filter((d) => !declarations.has(d.key));
  if (missingDeclarations.length) {
    errors.push(
      `Faltan declaraciones del paciente: ${missingDeclarations.map((d) => d.label).join('; ')}.`,
    );
  }

  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  if (notes.length > 2000) {
    errors.push('Las observaciones no pueden superar 2000 caracteres.');
  }

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    details: {
      code: spec.code,
      teeth: teeth.filter((t) => FDI_TEETH.has(t)),
      options,
      risksAccepted: spec.risks.map((r) => r.key),
      declarationsAccepted: spec.declarations.map((d) => d.key),
      notes,
      filledAt: now.toISOString(),
    },
  };
}

export interface CiSummarySection {
  title: string;
  items: string[];
}

/** Texto legible del detalle (PDF sellado y página pública de firma). */
export function ciDetailsSummary(
  spec: CiConsentSpec,
  details: CiConsentDetails,
): CiSummarySection[] {
  const sections: CiSummarySection[] = [
    {
      title: 'Procedimiento',
      items: [
        `Profesional: ${spec.professionalRole}`,
        `${spec.teethLabel.replace(/\s*\(.*\)$/, '')}: ${
          details.teeth.length ? details.teeth.join(', ') : 'No aplica / boca completa'
        }`,
        ...spec.options.map((group) => {
          const labels = (details.options[group.key] ?? [])
            .map((v) => group.choices.find((c) => c.value === v)?.label ?? v);
          return `${group.label}: ${labels.length ? labels.join(', ') : 'No aplica'}`;
        }),
      ],
    },
    {
      title: 'Riesgos explicados y aceptados',
      items: spec.risks
        .filter((r) => details.risksAccepted.includes(r.key))
        .map((r) => `${r.label}: ${r.detail}`),
    },
    {
      title: 'Declaraciones del paciente',
      items: spec.declarations
        .filter((d) => details.declarationsAccepted.includes(d.key))
        .map((d) => d.label),
    },
  ];
  if (details.notes) {
    sections.push({ title: 'Observaciones del profesional', items: [details.notes] });
  }
  return sections;
}
