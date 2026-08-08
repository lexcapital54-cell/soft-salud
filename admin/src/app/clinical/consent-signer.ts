import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import SignaturePad from 'signature_pad';
import { ClinicalApiService } from './clinical-api.service';
import { ConsentTemplate, PatientConsentRecord } from './consent.models';
import { DOCUMENT_TYPES } from './document-types';

@Component({
  selector: 'app-consent-signer',
  imports: [FormsModule, DatePipe],
  templateUrl: './consent-signer.html',
  styleUrl: './consent-signer.scss',
})
export class ConsentSigner implements OnInit, AfterViewInit, OnDestroy {
  private readonly api = inject(ClinicalApiService);
  private readonly sanitizer = inject(DomSanitizer);

  /** Opcional: sin paciente aún se pueden ver plantillas. */
  readonly patientId = input<string | null>(null);
  readonly encounterId = input<string | null>(null);
  readonly patientName = input<string>('');
  readonly patientDocument = input<string>('');
  readonly patientDocumentType = input<string>('CC');
  readonly professionalName = input<string>('');
  readonly professionalCard = input<string>('');

  readonly sealed = output<PatientConsentRecord>();
  readonly flagsChanged = output<void>();

  @ViewChild('padCanvas') private padCanvas?: ElementRef<HTMLCanvasElement>;

  readonly templates = signal<ConsentTemplate[]>([]);
  readonly signed = signal<PatientConsentRecord[]>([]);
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly selectedId = signal('');
  readonly hasStroke = signal(false);

  readonly documentTypes = DOCUMENT_TYPES;

  signerName = '';
  signerDocumentType = 'CC';
  signerDocument = '';

  private pad: SignaturePad | null = null;
  private resizeHandler = () => this.fitCanvas();
  private ready = false;

  readonly selected = computed(
    () => this.templates().find((t) => t.id === this.selectedId()) ?? null,
  );

  readonly canSeal = computed(
    () => !!this.patientId() && !!this.selected() && this.hasStroke(),
  );

  /** Vista previa diligenciada (se recalcula en cada CD al editar firmante). */
  previewHtml(): SafeHtml | null {
    const t = this.selected();
    if (!t) return null;
    return this.sanitizer.bypassSecurityTrustHtml(
      this.fillTemplatePlaceholders(t.bodyHtml),
    );
  }

  constructor() {
    effect(() => {
      const pid = this.patientId();
      const eid = this.encounterId();
      void eid;
      untracked(() => {
        this.signerName = this.patientName() || this.signerName;
        this.signerDocument = this.patientDocument() || this.signerDocument;
        this.signerDocumentType =
          this.patientDocumentType() || this.signerDocumentType || 'CC';
      });
      if (pid) {
        void this.loadSigned(pid);
      } else {
        this.signed.set([]);
      }
    });
  }

  ngOnInit() {
    void this.loadTemplates();
  }

  ngAfterViewInit() {
    this.ready = true;
    window.addEventListener('resize', this.resizeHandler);
    setTimeout(() => this.initPad(), 50);
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.resizeHandler);
    this.destroyPad();
  }

  async reload() {
    await this.loadTemplates();
    const pid = this.patientId();
    if (pid) await this.loadSigned(pid);
    if (this.ready) setTimeout(() => this.initPad(), 0);
  }

  async loadTemplates() {
    this.loading.set(true);
    this.error.set('');
    try {
      const templates = await firstValueFrom(this.api.listConsentTemplates());
      this.templates.set(templates);
      if (!templates.length) {
        this.error.set(
          'No hay plantillas en el servidor. En api ejecute: npm run prisma:seed',
        );
      } else if (
        !this.selectedId() ||
        !templates.some((t) => t.id === this.selectedId())
      ) {
        this.selectedId.set(templates[0].id);
      }
    } catch (err) {
      this.templates.set([]);
      const http = err as HttpErrorResponse;
      const detail =
        http?.status === 401
          ? 'Sesión expirada. Cierre sesión y vuelva a entrar.'
          : http?.status
            ? `HTTP ${http.status}`
            : 'error de red / API apagada';
      this.error.set(`No se pudieron cargar las plantillas (${detail}).`);
    } finally {
      this.loading.set(false);
      if (this.ready) setTimeout(() => this.initPad(), 0);
    }
  }

  private async loadSigned(patientId: string) {
    try {
      const signed = await firstValueFrom(
        this.api.listPatientConsents({
          patientId,
          encounterId: this.encounterId() ?? undefined,
        }),
      );
      this.signed.set(signed);
    } catch {
      this.signed.set([]);
    }
  }

  onSelectTemplate(id: string) {
    this.selectedId.set(id);
    this.message.set('');
    this.clearSignature();
  }

  clearSignature() {
    this.pad?.clear();
    this.hasStroke.set(false);
  }

  async acceptAndSeal() {
    this.error.set('');
    this.message.set('');
    const template = this.selected();
    const patientId = this.patientId();
    if (!patientId) {
      this.error.set('Abra o cree una atención con paciente antes de sellar.');
      return;
    }
    if (!template) {
      this.error.set('Seleccione una plantilla legal.');
      return;
    }
    if (!this.pad || this.pad.isEmpty()) {
      this.error.set('Debe trazar la firma en el canvas.');
      return;
    }

    this.submitting.set(true);
    try {
      const signatureBase64 = this.pad.toDataURL('image/png');
      const result = await firstValueFrom(
        this.api.signPatientConsent({
          patientId,
          templateId: template.id,
          encounterId: this.encounterId() ?? undefined,
          signerName: this.signerName.trim() || undefined,
          signerDocumentType: this.signerDocumentType || undefined,
          signerDocument: this.signerDocument.trim() || undefined,
          signatureBase64,
        }),
      );

      this.message.set(
        result.message ||
          'Documento aceptado, firmado y sellado como PDF inalterable.',
      );
      this.sealed.emit(result);
      this.flagsChanged.emit();
      this.clearSignature();
      await this.reload();
    } catch (err) {
      const http = err as HttpErrorResponse;
      this.error.set(
        http?.error?.message ||
          'No se pudo sellar el documento. Verifique la atención y vuelva a intentar.',
      );
    } finally {
      this.submitting.set(false);
    }
  }

  async openPdf(id: string) {
    this.error.set('');
    try {
      const blob = await firstValueFrom(this.api.downloadPatientConsentPdf(id));
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      this.error.set('No se pudo abrir el PDF sellado.');
    }
  }

  /**
   * Rellena guiones del texto legal con datos del paciente/firmante para lectura.
   * No edita la plantilla en BD; solo la vista previa.
   */
  private fillTemplatePlaceholders(html: string): string {
    const name = this.signerName.trim() || this.patientName() || '________________';
    const docType = this.signerDocumentType || this.patientDocumentType() || 'CC';
    const docNum = this.signerDocument.trim() || this.patientDocument() || '________________';
    const professional = this.professionalName().trim() || '________________';
    const card = this.professionalCard().trim() || '________';
    const today = new Date().toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    let out = html;
    // Ciudad y Fecha
    out = out.replace(
      /(<strong>Ciudad y Fecha:<\/strong>\s*)_{3,}/gi,
      `$1Manizales, ${today}`,
    );
    // Primer bloque largo de nombre (paciente / firmante)
    out = out.replace(
      /(Yo,\s*|Nosotros \(o Yo\),\s*)_{10,}/i,
      `$1<strong>${this.escapeHtml(name)}</strong>`,
    );
    // Documento del firmante principal
    out = out.replace(
      /(C\.C\. \/ C\.E\. \/ T\.I\. No\.|C\.C\. \/ C\.E\. No\.|C\.C\. No\.)\s*_{5,}/i,
      `$1 <strong>${this.escapeHtml(docType)} ${this.escapeHtml(docNum)}</strong>`,
    );
    // Psicólogo
    out = out.replace(
      /(psicólogo\(a\)\s*)_{10,}/gi,
      `$1<strong>${this.escapeHtml(professional)}</strong>`,
    );
    out = out.replace(
      /(Tarjeta Profesional No\.\s*)_{5,}/gi,
      `$1<strong>${this.escapeHtml(card)}</strong>`,
    );
    return out;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private destroyPad() {
    this.pad?.off();
    this.pad = null;
  }

  private initPad() {
    const canvas = this.padCanvas?.nativeElement;
    if (!canvas) return;

    this.destroyPad();
    this.fitCanvas();

    this.pad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(16, 24, 40)',
      minWidth: 0.8,
      maxWidth: 2.5,
      throttle: 0,
    });

    this.pad.addEventListener('beginStroke', () => this.hasStroke.set(true));
    this.pad.addEventListener('endStroke', () => {
      this.hasStroke.set(!this.pad?.isEmpty());
    });
    this.hasStroke.set(false);
  }

  private fitCanvas() {
    const canvas = this.padCanvas?.nativeElement;
    if (!canvas) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(Math.floor(rect.width), canvas.clientWidth, 320);
    const cssHeight = Math.max(Math.floor(rect.height), 180);

    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(cssHeight * ratio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(ratio, ratio);
    }

    this.pad?.clear();
    this.hasStroke.set(false);
  }
}
