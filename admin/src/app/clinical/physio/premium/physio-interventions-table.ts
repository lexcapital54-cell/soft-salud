import { Component, input } from '@angular/core';
import { InterventionRow } from './physio-premium.models';

/** Técnicas e intervenciones del plan; en espacios angostos cada fila se vuelve tarjeta. */
@Component({
  selector: 'app-physio-interventions-table',
  template: `
    <div class="it-wrap">
      <table class="it">
        <thead>
          <tr>
            <th scope="col">Técnica / intervención</th>
            <th scope="col">Sesiones</th>
            <th scope="col">Frecuencia</th>
            <th scope="col">Estado</th>
            <th scope="col">Observaciones</th>
          </tr>
        </thead>
        <tbody>
          @for (r of rows(); track $index) {
            <tr>
              <td data-label="Técnica">
                <strong>{{ r.technique }}</strong>
                @if (r.code) {
                  <small>CUPS {{ r.code }}</small>
                }
              </td>
              <td data-label="Sesiones">{{ r.sessions || '—' }}</td>
              <td data-label="Frecuencia">{{ r.frequency || '—' }}</td>
              <td data-label="Estado">
                @if (r.status) {
                  <span class="it-chip" [attr.data-tone]="r.status.tone">{{ r.status.text }}</span>
                } @else {
                  <span class="it-muted">Terapia indicada</span>
                }
              </td>
              <td data-label="Observaciones">{{ r.notes || '—' }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host { display: block; container: it / inline-size; }
    .it-wrap { max-height: 360px; overflow: auto; border: 1px solid var(--pd-line, #e3e9f0); border-radius: 14px; }
    .it { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.86rem; }
    th {
      position: sticky; top: 0; z-index: 1; text-align: left; padding: 10px 12px; background: var(--pd-soft, #eaf1f7);
      color: var(--pd-navy, #0b2239); font-weight: 600; font-size: 0.78rem; letter-spacing: 0.02em; border-bottom: 1px solid var(--pd-line, #e3e9f0);
    }
    td { padding: 10px 12px; border-bottom: 1px solid #eef2f6; color: var(--pd-ink, #172033); vertical-align: top; }
    tbody tr:last-child td { border-bottom: 0; }
    tbody tr:hover td { background: #f8fafc; }
    td strong { display: block; font-weight: 600; color: var(--pd-navy, #0b2239); }
    td small { color: var(--pd-muted, #687386); font-size: 0.74rem; }
    .it-chip { display: inline-block; padding: 2px 9px; border-radius: 7px; font-size: 0.74rem; font-weight: 600; background: #f1f4f7; color: #4c5869; }
    .it-chip[data-tone='ok'] { background: #e5f6ee; color: #13704d; }
    .it-chip[data-tone='mild'] { background: #fbf3e4; color: #7a5718; }
    .it-chip[data-tone='danger'] { background: #fbe9e9; color: #9b3333; }
    .it-muted { color: var(--pd-muted, #687386); font-size: 0.8rem; }
    @container it (max-width: 560px) {
      .it-wrap { max-height: none; border: 0; overflow: visible; }
      .it thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      .it, .it tbody, .it tr, .it td { display: block; width: 100%; }
      .it tr { border: 1px solid var(--pd-line, #e3e9f0); border-radius: 12px; padding: 8px 12px; margin-bottom: 10px; }
      .it td { display: flex; justify-content: space-between; gap: 12px; padding: 5px 0; border: 0; text-align: right; }
      .it td::before { content: attr(data-label); color: var(--pd-muted, #687386); font-size: 0.76rem; text-align: left; flex: 0 0 auto; }
      .it td:first-child { display: block; text-align: left; padding-bottom: 8px; border-bottom: 1px solid #eef2f6; margin-bottom: 4px; }
      .it td:first-child::before { display: none; }
      tbody tr:hover td { background: none; }
    }
  `,
})
export class PhysioInterventionsTable {
  readonly rows = input.required<InterventionRow[]>();
}
