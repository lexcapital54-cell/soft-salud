import { Component, input, output } from '@angular/core';
import { Patient } from '../../clinical.models';
import { PhysioIcon } from '../physio-icons';
import { ageFrom, formatDate, sexLabel } from './physio-premium.models';

/** Tarjeta principal del paciente con los datos reales de su ficha y un resumen de la atención. */
@Component({
  selector: 'app-physio-patient-card',
  imports: [PhysioIcon],
  template: `
    @let p = patient();
    <section class="pc" aria-label="Datos del paciente">
      <div class="pc-photo">
        @if (photo()) {
          <img [src]="photo()" [alt]="'Foto de ' + fullName()" />
        } @else {
          <span class="pc-initials" aria-hidden="true">{{ initials() }}</span>
        }
      </div>

      <div class="pc-main">
        <div class="pc-title">
          <h2>{{ fullName() || 'Paciente sin nombre' }}</h2>
          <span class="pc-status" [class.sealed]="sealed()">{{ sealed() ? 'Historia sellada' : 'Historia en curso' }}</span>
        </div>
        <p class="pc-sub">
          @if (p?.documentNumber) {
            <span>{{ p?.documentType }} {{ p?.documentNumber }}</span>
          }
          @if (age() !== null) {
            <span>{{ age() }} años</span>
          }
          @if (sex()) {
            <span>{{ sex() }}</span>
          }
        </p>
        <ul class="pc-facts">
          <li [class.missing]="!p?.birthDate">
            <app-physio-icon name="calendar" /><span class="sr">Fecha de nacimiento:</span>{{ birth() || 'Nacimiento sin registrar' }}
          </li>
          <li [class.missing]="!p?.phone"><app-physio-icon name="phone" /><span class="sr">Teléfono:</span>{{ p?.phone || 'Sin teléfono' }}</li>
          <li [class.missing]="!p?.email"><app-physio-icon name="mail" /><span class="sr">Correo:</span>{{ p?.email || 'Sin correo' }}</li>
          <li [class.missing]="!place()"><app-physio-icon name="pin" /><span class="sr">Residencia:</span>{{ place() || 'Dirección sin registrar' }}</li>
        </ul>
      </div>

      <dl class="pc-side">
        <div>
          <dt>Motivo principal</dt>
          <dd [class.missing]="!motive()">{{ motive() || 'Sin registrar' }}</dd>
        </div>
        <div>
          <dt>Modalidad</dt>
          <dd>{{ modality() || '—' }}</dd>
        </div>
        @if (professional()) {
          <div>
            <dt>Profesional</dt>
            <dd>{{ professional() }}</dd>
          </div>
        }
        @if (editable()) {
          <button type="button" class="pc-edit" (click)="edit.emit()"><app-physio-icon name="pencil" />Editar ficha</button>
        }
      </dl>
    </section>
  `,
  styles: `
    :host { display: block; container: pc / inline-size; }
    .pc {
      display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(180px, 240px); gap: 22px; align-items: center;
      background: #fff; border: 1px solid var(--pd-line, #e3e9f0); border-radius: 20px; padding: 20px 22px;
      box-shadow: 0 1px 2px rgba(var(--pd-shadow-rgb, 11, 34, 57), 0.04), 0 14px 34px -24px rgba(var(--pd-shadow-rgb, 11, 34, 57), 0.4);
    }
    .pc-photo { width: 104px; height: 104px; border-radius: 50%; padding: 3px; background: linear-gradient(140deg, var(--pd-gold-soft, #e2c58e), var(--pd-gold, #c79a4b)); }
    .pc-photo img, .pc-initials { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 3px solid #fff; display: grid; place-items: center; }
    .pc-initials { background: var(--pd-navy, #0b2239); color: #fff; font-size: 2rem; font-weight: 600; font-family: var(--pd-serif); letter-spacing: 0.04em; }
    .pc-title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    h2 { margin: 0; font-family: var(--pd-serif); font-size: 1.55rem; font-weight: 600; color: var(--pd-navy, #0b2239); line-height: 1.15; }
    .pc-status { padding: 4px 12px; border-radius: 999px; font-size: 0.75rem; font-weight: 600; background: #fbf3e4; color: #7a5718; border: 1px solid #ecd9b4; }
    .pc-status.sealed { background: #e5f6ee; color: #13704d; border-color: #bfe6d3; }
    .pc-sub { display: flex; flex-wrap: wrap; gap: 0; margin: 6px 0 12px; color: var(--pd-ink, #172033); font-size: 0.98rem; }
    .pc-sub span + span::before { content: '|'; margin: 0 12px; color: #c4ccd6; }
    .pc-facts { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 20px; font-size: 0.88rem; color: var(--pd-ink, #172033); }
    .pc-facts li { display: flex; align-items: center; gap: 8px; min-width: 0; overflow-wrap: anywhere; }
    .pc-facts li.missing { color: var(--pd-muted, #687386); font-style: italic; }
    .pc-facts app-physio-icon { width: 17px; height: 17px; color: var(--pd-navy-2, #163a59); }
    .pc-side { margin: 0; padding-left: 20px; border-left: 1px solid var(--pd-line, #e3e9f0); display: grid; gap: 12px; }
    dt { font-size: 0.74rem; color: var(--pd-muted, #687386); text-transform: uppercase; letter-spacing: 0.06em; }
    dd { margin: 2px 0 0; font-weight: 600; color: var(--pd-navy, #0b2239); font-size: 0.92rem; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    dd.missing { color: var(--pd-muted, #687386); font-weight: 400; font-style: italic; }
    .pc-edit {
      justify-self: start; display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 4px 12px;
      border: 1px solid var(--pd-line, #d8e1ea); border-radius: 999px; background: #fff; color: var(--pd-navy, #0b2239);
      font: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer;
    }
    .pc-edit app-physio-icon { width: 14px; height: 14px; color: currentColor; }
    .pc-edit:hover { border-color: var(--pd-navy, #0b2239); }
    .pc-edit:focus-visible { outline: 3px solid rgba(var(--pd-gold-rgb, 199, 154, 75), 0.55); outline-offset: 2px; }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    @container pc (max-width: 760px) {
      .pc { grid-template-columns: auto minmax(0, 1fr); }
      .pc-side { grid-column: 1 / -1; padding: 14px 0 0; border-left: 0; border-top: 1px solid var(--pd-line, #e3e9f0); grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
    }
    @container pc (max-width: 520px) {
      .pc { grid-template-columns: 1fr; justify-items: center; text-align: center; padding: 18px 16px; }
      .pc-title, .pc-sub { justify-content: center; }
      .pc-facts { grid-template-columns: 1fr; justify-items: start; text-align: left; }
      .pc-side { text-align: left; justify-self: stretch; }
    }
  `,
})
export class PhysioPatientCard {
  readonly patient = input<Partial<Patient> | null>(null);
  readonly photo = input<string | null>(null);
  readonly motive = input('');
  readonly modality = input('');
  readonly professional = input('');
  readonly sealed = input(false);
  readonly editable = input(false);
  readonly edit = output<void>();

  /** La ficha llega como objeto mutable (se edita en el formulario): se lee en cada render. */
  fullName() {
    const p = this.patient();
    return [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim();
  }
  initials() {
    const p = this.patient();
    return `${(p?.firstName || '').charAt(0)}${(p?.lastName || '').charAt(0)}`.toUpperCase() || '·';
  }
  age() {
    return ageFrom(this.patient()?.birthDate);
  }
  sex() {
    return sexLabel(this.patient()?.sexAtBirth);
  }
  birth() {
    return formatDate(this.patient()?.birthDate?.slice(0, 10));
  }
  place() {
    const p = this.patient();
    return [p?.address, p?.city].filter((x) => !!x && !!String(x).trim()).join(', ');
  }
}
