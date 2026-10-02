import { PhysiotherapyContent } from '../clinical.models';
import { zoneLabel } from './physio-body-map.data';
import {
  OTHER_ANTECEDENTS,
  PAIN_FREQUENCIES,
  POSTURE_OPTIONS,
  RANGE_OPTIONS,
  STRENGTH_OPTIONS,
  normalizeIntake,
  painBand,
  parsePain,
  therapyLabel,
} from './physio-intake.models';

const labelOf = (list: ReadonlyArray<{ key: string; label: string }>, key: string) =>
  list.find((o) => o.key === key)?.label ?? '';

const withNotes = (title: string, value: string, notes: string) =>
  value || notes.trim() ? `${title}: ${[value, notes.trim()].filter(Boolean).join(' — ')}` : '';

/** Filas de solo lectura (historia sellada) con lo registrado en la valoración interactiva. */
export function physioIntakeSummary(ft: PhysiotherapyContent): Array<{ label: string; value: string }> {
  const i = normalizeIntake(ft.intake);
  const a = i.antecedents;
  const d = ft.antecedentsDetail ?? ({} as PhysiotherapyContent['antecedentsDetail']);
  const group = (noRefers: boolean, marks: string[], detail?: string) =>
    noRefers && !marks.length && !detail?.trim() ? 'No refiere' : [...marks, detail?.trim() ?? ''].filter(Boolean).join(', ');

  const antecedents = [
    ['Patológicos', group(a.pathological.noRefers, [a.pathological.diabetes && 'Diabetes', a.pathological.hypertension && 'Hipertensión', a.pathological.surgeries && 'Cirugías'].filter((x): x is string => !!x), d.pathological)],
    ['Quirúrgicos', group(a.surgical.noRefers, a.surgical.date ? [`Fecha ${a.surgical.date}`] : [], d.surgical)],
    ['Traumáticos', group(a.traumatic.noRefers, [a.traumatic.fractures && 'Fracturas', a.traumatic.sprains && 'Esguinces'].filter((x): x is string => !!x), d.traumatic)],
    ['Alergias', group(a.allergies.noRefers, a.allergies.hasAllergies ? ['Sí'] : [], d.allergic)],
    ...OTHER_ANTECEDENTS.map((o) => [o.label, group(a.noRefersOther.includes(o.key), [], d[o.key])]),
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  const pain = parsePain(ft.functionalAssessment?.['pain']);
  const assessment = [
    withNotes('Postura', labelOf(POSTURE_OPTIONS, i.posture), i.postureNotes),
    withNotes('Rango de movimiento', labelOf(RANGE_OPTIONS, i.rangeOfMotion), i.rangeNotes),
    withNotes('Fuerza muscular', labelOf(STRENGTH_OPTIONS, i.strength), i.strengthNotes),
    pain !== null ? `Dolor EVA: ${pain}/10 (${painBand(pain).label.toLowerCase()})` : '',
    i.painFrequency ? `Frecuencia del dolor: ${labelOf(PAIN_FREQUENCIES, i.painFrequency)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const therapies = [...i.therapies.map(therapyLabel), i.therapiesOther.trim()].filter(Boolean).join(', ');
  const zones = [i.zones.map(zoneLabel).join(', '), i.zonesNotes.trim()].filter(Boolean).join('\n');

  return [
    { label: 'Fecha de valoración', value: i.assessmentDate },
    { label: 'Antecedentes', value: antecedents },
    { label: 'Zonas a tratar', value: zones },
    { label: 'Valoración fisioterapéutica', value: assessment },
    { label: 'Terapias a aplicar', value: therapies },
  ].filter((r) => r.value);
}
