import { Component, computed, input, model, signal } from '@angular/core';
import { CiConsentDetails, CiConsentSpec, CiOptionGroup } from '../consent.models';
import {
  FDI_PERMANENT_ROWS,
  FDI_PRIMARY_ROWS,
  THIRD_MOLARS,
  ciProgress,
  toggleIn,
} from './consent-ci.logic';

/**
 * Detalle estructurado de un CI (dientes FDI, opciones, riesgos y
 * declaraciones). Solo diligencia datos; la validación final la hace el API.
 */
@Component({
  selector: 'app-consent-ci-details',
  templateUrl: './consent-ci-details.html',
  styleUrl: './consent-ci-details.scss',
})
export class ConsentCiDetails {
  readonly spec = input.required<CiConsentSpec>();
  readonly details = model.required<CiConsentDetails>();
  readonly disabled = input(false);

  readonly showPrimary = signal(false);
  readonly openRisk = signal<string | null>(null);

  readonly permanentRows = FDI_PERMANENT_ROWS;
  readonly primaryRows = FDI_PRIMARY_ROWS;

  readonly progress = computed(() => ciProgress(this.spec(), this.details()));
  readonly percent = computed(() => {
    const p = this.progress();
    return p.total ? Math.round((p.done / p.total) * 100) : 100;
  });
  readonly risksDone = computed(
    () => this.spec().risks.filter((r) => this.details().risksAccepted.includes(r.key)).length,
  );

  private patch(change: Partial<CiConsentDetails>) {
    if (this.disabled()) return;
    this.details.set({ ...this.details(), ...change });
  }

  hasTooth(t: number) {
    return this.details().teeth.includes(t);
  }

  toggleTooth(t: number) {
    const teeth = this.hasTooth(t)
      ? this.details().teeth.filter((x) => x !== t)
      : [...this.details().teeth, t].sort((a, b) => a - b);
    this.patch({ teeth });
  }

  addThirdMolars() {
    this.patch({ teeth: [...new Set([...this.details().teeth, ...THIRD_MOLARS])].sort((a, b) => a - b) });
  }

  clearTeeth() {
    this.patch({ teeth: [] });
  }

  picked(group: CiOptionGroup, value: string) {
    return (this.details().options[group.key] ?? []).includes(value);
  }

  pick(group: CiOptionGroup, value: string) {
    const current = this.details().options[group.key] ?? [];
    const next = group.multiple
      ? toggleIn(current, value)
      : current.includes(value) && !group.required
        ? []
        : [value];
    this.patch({ options: { ...this.details().options, [group.key]: next } });
  }

  riskAccepted(key: string) {
    return this.details().risksAccepted.includes(key);
  }

  toggleRisk(key: string) {
    this.patch({ risksAccepted: toggleIn(this.details().risksAccepted, key) });
  }

  declarationAccepted(key: string) {
    return this.details().declarationsAccepted.includes(key);
  }

  toggleDeclaration(key: string) {
    this.patch({ declarationsAccepted: toggleIn(this.details().declarationsAccepted, key) });
  }

  setNotes(value: string) {
    this.patch({ notes: value.slice(0, 2000) });
  }

  toggleRiskDetail(key: string) {
    this.openRisk.set(this.openRisk() === key ? null : key);
  }
}
