import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Encabezado con el estado de guardado del seguimiento de ortodoncia del paciente. */
@Component({
  selector: 'app-ortho-live-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-content />
    <span class="chip" [attr.data-status]="status()" role="status" aria-live="polite">
      <span class="dot" aria-hidden="true"></span>{{ label() }}
    </span>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      min-width: 0;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.2rem 0.65rem;
      border-radius: 999px;
      font-size: 0.75rem;
      background: #eef2f7;
      color: #475569;
      transition: background 0.2s, color 0.2s;
    }
    .dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 50%;
      background: currentColor;
    }
    .chip[data-status='saved'] { background: #e7f6ec; color: #1f7a3d; }
    .chip[data-status='pending'],
    .chip[data-status='saving'],
    .chip[data-status='loading'] { background: #fff6e0; color: #8a5a00; }
    .chip[data-status='pending'] .dot,
    .chip[data-status='saving'] .dot,
    .chip[data-status='loading'] .dot { animation: pulse 1s ease-in-out infinite; }
    .chip[data-status='error'],
    .chip[data-status='conflict'] { background: #fdecec; color: #b42318; }
    @keyframes pulse { 50% { opacity: 0.3; } }
  `,
})
export class OrthoLiveChip {
  readonly status = input('idle');
  readonly label = input('');
}
