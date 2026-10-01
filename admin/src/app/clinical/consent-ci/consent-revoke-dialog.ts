import {
  Component,
  ElementRef,
  ViewChild,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ClinicalApiService } from '../clinical-api.service';
import { PatientConsentRecord } from '../consent.models';
import { SignaturePadComponent } from './signature-pad';

/** Revocatoria voluntaria: motivo + firma de quien revoca; sella un PDF aparte. */
@Component({
  selector: 'app-consent-revoke-dialog',
  imports: [SignaturePadComponent, DatePipe],
  template: `
    <dialog #dlg class="rv" (close)="onClosed()">
      @if (consent(); as c) {
        <form method="dialog" class="rv-body" (submit)="$event.preventDefault()">
          <header>
            <p class="rv-eyebrow">Revocatoria voluntaria</p>
            <h3>{{ c.template?.code }} · {{ c.template?.title }}</h3>
            <p class="rv-sub">
              Firmado el {{ c.signedAt | date: 'medium' }}. El PDF original se conserva intacto; se genera
              un PDF sellado adicional con la revocatoria.
            </p>
          </header>

          <label class="rv-field">
            Nombre de quien revoca
            <input [value]="signerName()" (input)="signerName.set($any($event.target).value)" maxlength="160" />
          </label>

          <label class="rv-field">
            Motivo expresado por el paciente <span class="req">*</span>
            <textarea
              rows="3"
              maxlength="2000"
              [value]="reason()"
              (input)="reason.set($any($event.target).value)"
              placeholder="Ej.: decide no continuar con el tratamiento por motivos personales."
            ></textarea>
          </label>

          <p class="rv-warn">
            Explique al paciente los riesgos de suspender o no iniciar el tratamiento. La revocatoria no
            borra la historia clínica ni afecta los procedimientos ya realizados.
          </p>

          <app-signature-pad label="Firma de quien revoca" (changed)="signature.set($event)" />

          @if (error()) {
            <p class="rv-err">{{ error() }}</p>
          }

          <footer>
            <button type="button" class="rv-ghost" (click)="close()" [disabled]="busy()">Cancelar</button>
            <button
              type="button"
              class="rv-danger"
              (click)="confirm()"
              [disabled]="busy() || reason().trim().length < 5 || !signature()"
            >
              {{ busy() ? 'Sellando revocatoria…' : 'Revocar consentimiento' }}
            </button>
          </footer>
        </form>
      }
    </dialog>
  `,
  styles: `
    .rv { border: none; border-radius: 16px; padding: 0; width: min(560px, 94vw); box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35); }
    .rv::backdrop { background: rgba(15, 23, 42, 0.45); }
    .rv-body { padding: 20px 22px; display: grid; gap: 12px; }
    header h3 { margin: 2px 0; font-size: 1.05rem; color: var(--hce-title, #003d4c); }
    .rv-eyebrow { margin: 0; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #b91c1c; }
    .rv-sub { margin: 0; font-size: 0.82rem; color: #64748b; }
    .rv-field { display: grid; gap: 4px; font-weight: 600; color: var(--hce-title, #003d4c); }
    .rv-field input, .rv-field textarea { font: inherit; font-weight: 400; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 10px; }
    .req { color: #dc2626; }
    .rv-warn { margin: 0; padding: 8px 12px; border-radius: 10px; background: #fef2f2; color: #991b1b; font-size: 0.82rem; }
    .rv-err { margin: 0; color: #b91c1c; font-weight: 600; font-size: 0.85rem; }
    footer { display: flex; justify-content: flex-end; gap: 8px; }
    footer button { border-radius: 10px; padding: 8px 14px; font-weight: 600; cursor: pointer; }
    .rv-ghost { border: 1px solid #cbd5e1; background: #fff; }
    .rv-danger { border: none; background: #b91c1c; color: #fff; }
    footer button:disabled { opacity: 0.5; cursor: default; }
  `,
})
export class ConsentRevokeDialog {
  private readonly api = inject(ClinicalApiService);

  readonly consent = input<PatientConsentRecord | null>(null);
  readonly revoked = output<PatientConsentRecord>();
  readonly closed = output<void>();

  @ViewChild('dlg', { static: true })
  private dialog!: ElementRef<HTMLDialogElement>;

  readonly reason = signal('');
  readonly signerName = signal('');
  readonly signature = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');

  open(signerName: string) {
    this.reason.set('');
    this.signature.set(null);
    this.error.set('');
    this.signerName.set(signerName);
    this.dialog.nativeElement.showModal();
  }

  close() {
    this.dialog.nativeElement.close();
  }

  onClosed() {
    this.closed.emit();
  }

  async confirm() {
    const c = this.consent();
    const signatureBase64 = this.signature();
    if (!c || !signatureBase64) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await firstValueFrom(
        this.api.revokePatientConsent(c.id, {
          reason: this.reason().trim(),
          signerName: this.signerName().trim() || undefined,
          signatureBase64,
        }),
      );
      this.revoked.emit(result);
      this.close();
    } catch (err) {
      const http = err as HttpErrorResponse;
      this.error.set(http?.error?.message || 'No se pudo registrar la revocatoria.');
    } finally {
      this.busy.set(false);
    }
  }
}
