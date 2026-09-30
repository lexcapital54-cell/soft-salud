import { Component, input, output } from '@angular/core';
import type { DentistryContent } from './dentistry.models';

export interface SignedConsentInfo {
  code: string;
  signedAt: string;
  version: number | null;
  signer: string;
}

interface BoardItem {
  code: string;
  label: string;
  reason: string;
  required: boolean;
  suggested: boolean;
  signed: SignedConsentInfo | undefined;
}

const ORTHO_CONSENTS: Array<{ code: string; label: string }> = [
  { code: 'ODO_ORTHODONTICS', label: 'Consentimiento ortodóntico' },
  { code: 'ODO_PHOTOS', label: 'Fotografías clínicas' },
  { code: 'ORT_ALIGNERS', label: 'Alineadores' },
  { code: 'ODO_EXTRACTION', label: 'Extracción' },
  { code: 'ORT_TAD', label: 'Mini implantes (TAD)' },
  { code: 'ORT_ADDITIONAL', label: 'Procedimiento adicional' },
  { code: 'ORT_RETENTION', label: 'Retención' },
];

/** Tablero de consentimientos de ortodoncia: sugeridos según el caso, solicitados y firmados. */
@Component({
  selector: 'app-ortho-consent-board',
  template: `
    @let list = items();
    @let done = signedCount(list);
    @let need = neededCount(list);
    <div class="cb">
      <div class="cb-head">
        <svg viewBox="0 0 36 36" class="cb-ring" aria-hidden="true">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" stroke-width="3.5" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#16a34a" stroke-width="3.5" stroke-linecap="round"
            [attr.stroke-dasharray]="(need ? (done / need) * 100 : 0) + ' 100'" transform="rotate(-90 18 18)" />
          <text x="18" y="21" text-anchor="middle" class="cb-ring-t">{{ done }}/{{ need }}</text>
        </svg>
        <div>
          <b>{{ done }} de {{ need }} consentimientos firmados</b>
          <p class="cb-lbl">Sugeridos a partir del plan, la mecánica y las fotografías. El profesional decide cuáles solicitar.</p>
        </div>
        @if (!disabled() && pendingSuggested(list)) {
          <button type="button" class="cb-btn" (click)="requestSuggested(list)">Solicitar los {{ pendingSuggested(list) }} sugeridos</button>
        }
      </div>
      <div class="cb-grid">
        @for (c of list; track c.code) {
          <div class="cb-card" [class.signed]="!!c.signed" [class.req]="c.required && !c.signed" [class.sug]="c.suggested && !c.required && !c.signed">
            <span class="cb-ico" aria-hidden="true">{{ c.signed ? '✓' : c.required ? '!' : c.suggested ? '?' : '·' }}</span>
            <div class="cb-body">
              <b>{{ c.label }}</b>
              @if (c.signed; as s) {
                <small>Firmado {{ day(s.signedAt) }}{{ s.version ? ' · v' + s.version : '' }}{{ s.signer ? ' · ' + s.signer : '' }}</small>
              } @else if (c.required) {
                <small>Solicitado · pendiente de firma</small>
              } @else if (c.suggested) {
                <small>Sugerido: {{ c.reason }}</small>
              } @else {
                <small>No solicitado</small>
              }
            </div>
            @if (!disabled() && !c.signed) {
              <div class="cb-actions">
                @if (c.required) {
                  <button type="button" class="cb-sign" (click)="sign.emit(c.code)">Firmar</button>
                  <button type="button" class="cb-link" (click)="toggle.emit({ code: c.code, checked: false })">No aplica</button>
                } @else {
                  <button type="button" class="cb-link" (click)="toggle.emit({ code: c.code, checked: true })">Solicitar</button>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .cb { display: grid; gap: 10px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 16px; background: #fff; }
    .cb-head { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; font-size: 13px; color: #123b60; }
    .cb-ring { width: 54px; height: 54px; }
    .cb-ring-t { font-size: 9px; font-weight: 700; fill: #123b60; }
    .cb-lbl { margin: 2px 0 0; font-size: 11px; color: #64748b; }
    .cb-btn { margin-left: auto; border: 0; background: #12609a; color: #fff; border-radius: 99px; padding: 6px 14px; font-size: 12px; cursor: pointer; }
    .cb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
    .cb-card { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc; }
    .cb-card.signed { border-color: #bbf7d0; background: #f0fdf4; }
    .cb-card.req { border-color: #fde68a; background: #fffbeb; }
    .cb-card.sug { border-style: dashed; border-color: #93c5fd; background: #fff; }
    .cb-ico { flex: 0 0 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 13px; color: #fff; background: #cbd5e1; }
    .signed .cb-ico { background: #16a34a; }
    .req .cb-ico { background: #f59e0b; }
    .sug .cb-ico { background: #3b82f6; }
    .cb-body { flex: 1; display: grid; font-size: 13px; min-width: 0; }
    .cb-body small { font-size: 11px; color: #64748b; }
    .cb-actions { display: grid; gap: 2px; justify-items: end; }
    .cb-sign { border: 0; background: #16a34a; color: #fff; border-radius: 99px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
    .cb-link { border: 0; background: none; padding: 0; color: #12609a; text-decoration: underline; font-size: 11px; cursor: pointer; }
  `,
})
export class OrthoConsentBoard {
  readonly data = input.required<DentistryContent>();
  readonly signed = input<SignedConsentInfo[]>([]);
  readonly disabled = input(false);
  /** Códigos con plantilla en la especialidad del consultorio. */
  readonly available = input<string[] | null>(null);
  readonly toggle = output<{ code: string; checked: boolean }>();
  readonly sign = output<string>();

  items(): BoardItem[] {
    const d = this.data();
    const required = new Set(d.requiredConsents);
    const reasons = this.reasons(d);
    const available = this.available();
    return ORTHO_CONSENTS.filter((c) => !available || available.includes(c.code) || required.has(c.code)).map((c) => ({
      ...c,
      reason: reasons[c.code] ?? '',
      required: required.has(c.code),
      suggested: !!reasons[c.code],
      signed: [...this.signed()].filter((s) => s.code === c.code).sort((a, b) => b.signedAt.localeCompare(a.signedAt))[0],
    }));
  }

  private reasons(d: DentistryContent): Record<string, string> {
    const r: Record<string, string> = { ODO_ORTHODONTICS: 'tratamiento de ortodoncia' };
    if (Object.keys(d.photos || {}).length) r['ODO_PHOTOS'] = 'hay fotografías clínicas';
    if (d.orthoMech.aligners.total || d.orthoMech.appliances.some((a) => /alineador/i.test(a.type))) r['ORT_ALIGNERS'] = 'plan con alineadores';
    if (d.orthoDx.extractions.length || d.orthodontics.extractions.trim()) r['ODO_EXTRACTION'] = 'extracciones indicadas';
    if (d.orthoMech.tads.length) r['ORT_TAD'] = 'mini implantes registrados';
    if (d.orthoMech.ipr.length) r['ORT_ADDITIONAL'] = 'reducción interproximal planificada';
    if (d.orthoFollow.retainers.length || d.orthodontics.retention.trim()) r['ORT_RETENTION'] = 'plan de retención';
    return r;
  }

  signedCount(list: BoardItem[]) {
    return list.filter((c) => c.signed).length;
  }

  neededCount(list: BoardItem[]) {
    return list.filter((c) => c.signed || c.required).length;
  }

  pendingSuggested(list: BoardItem[]) {
    return list.filter((c) => c.suggested && !c.required && !c.signed).length;
  }

  requestSuggested(list: BoardItem[]) {
    for (const c of list) if (c.suggested && !c.required && !c.signed) this.toggle.emit({ code: c.code, checked: true });
  }

  day(v: string) {
    return v ? v.slice(0, 10).split('-').reverse().join('/') : '';
  }
}
