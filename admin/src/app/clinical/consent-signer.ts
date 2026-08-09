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
  readonly patientCity = input<string>('Manizales');
  readonly professionalName = input<string>('');
  readonly professionalCard = input<string>('');
  readonly userFullName = input<string>('');

  /** Firma de la profesional compartida con el panel «Firma digital (Ley 527)». */
  readonly professionalSignature = input<string | null>(null);

  readonly sealed = output<PatientConsentRecord>();
  readonly flagsChanged = output<void>();
  /** Avisa a la HC del trazo de la Dra para reflejarlo en el otro panel. */
  readonly professionalSigned = output<string>();

  @ViewChild('patientPadCanvas')
  private patientPadCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('professionalPadCanvas')
  private professionalPadCanvas?: ElementRef<HTMLCanvasElement>;

  readonly templates = signal<ConsentTemplate[]>([]);
  readonly signed = signal<PatientConsentRecord[]>([]);
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly selectedId = signal('');
  readonly hasPatientStroke = signal(false);
  readonly hasProfessionalStroke = signal(false);

  readonly documentTypes = DOCUMENT_TYPES;

  signerName = '';
  signerDocumentType = 'CC';
  signerDocument = '';

  private patientPad: SignaturePad | null = null;
  private professionalPad: SignaturePad | null = null;
  private resizeHandler = () => this.fitCanvases();
  private ready = false;
  /** Evita reaplicar en bucle la firma que llega desde la HC. */
  private appliedProfessionalSignature: string | null = null;

  readonly selected = computed(
    () => this.templates().find((t) => t.id === this.selectedId()) ?? null,
  );

  /** Hay consentimiento por sellar: paciente, plantilla y firma del paciente. */
  readonly canSeal = computed(
    () => !!this.patientId() && !!this.selected() && this.hasPatientStroke(),
  );

  hasPatientSignature() {
    return this.hasPatientStroke();
  }

  hasProfessionalSignature() {
    return this.hasProfessionalStroke() || !!this.professionalSignature();
  }

  /** Vista previa diligenciada (se recalcula en cada CD al editar firmante). */
  previewHtml(): SafeHtml | null {
    const t = this.selected();
    if (!t) return null;
    return this.sanitizer.bypassSecurityTrustHtml(this.fillTemplatePlaceholders(t.bodyHtml));
  }

  constructor() {
    effect(() => {
      const pid = this.patientId();
      const eid = this.encounterId();
      const name = this.patientName();
      const doc = this.patientDocument();
      const docType = this.patientDocumentType();
      void eid;
      // Siempre sincronizar con el paciente de la atención / selección.
      this.signerName = (name || '').trim();
      this.signerDocument = (doc || '').trim();
      this.signerDocumentType = docType || 'CC';
      if (pid) {
        void this.loadSigned(pid);
      } else {
        this.signed.set([]);
      }
    });

    effect(() => {
      const incoming = this.professionalSignature();
      if (!incoming || incoming === this.appliedProfessionalSignature) return;
      this.appliedProfessionalSignature = incoming;
      this.drawProfessionalSignature(incoming);
    });
  }

  /** Pinta en el lienzo de la Dra la firma hecha en el panel Ley 527. */
  private drawProfessionalSignature(dataUrl: string) {
    const apply = () => {
      const pad = this.professionalPad;
      const canvas = this.professionalPadCanvas?.nativeElement;
      if (!pad || !canvas) return;
      pad.clear();
      void pad.fromDataURL(dataUrl, {
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      });
      this.hasProfessionalStroke.set(true);
    };
    if (this.professionalPad) apply();
    else setTimeout(apply, 80);
  }

  ngOnInit() {
    void this.loadTemplates();
  }

  ngAfterViewInit() {
    this.ready = true;
    window.addEventListener('resize', this.resizeHandler);
    setTimeout(() => this.initPads(), 50);
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.resizeHandler);
    this.destroyPads();
  }

  async reload() {
    await this.loadTemplates();
    const pid = this.patientId();
    if (pid) await this.loadSigned(pid);
    if (this.ready) setTimeout(() => this.initPads(), 0);
  }

  async loadTemplates() {
    this.loading.set(true);
    this.error.set('');
    try {
      const templates = await firstValueFrom(this.api.listConsentTemplates());
      this.templates.set(templates);
      if (!templates.length) {
        this.error.set('No hay plantillas en el servidor. En api ejecute: npm run prisma:seed');
      } else if (!this.selectedId() || !templates.some((t) => t.id === this.selectedId())) {
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
      if (this.ready) setTimeout(() => this.initPads(), 0);
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
    this.clearSignatures();
    // La firma de la Dra es una sola para toda la atención: se conserva.
    const shared = this.professionalSignature();
    if (shared) this.drawProfessionalSignature(shared);
  }

  clearSignatures() {
    this.patientPad?.clear();
    this.professionalPad?.clear();
    this.hasPatientStroke.set(false);
    this.hasProfessionalStroke.set(false);
    this.appliedProfessionalSignature = null;
  }

  /**
   * Sella el consentimiento. Lo dispara el botón único «Guardar historia
   * clínica»; este componente ya no tiene acción propia de sellado.
   */
  async seal(): Promise<boolean> {
    this.error.set('');
    this.message.set('');
    const template = this.selected();
    const patientId = this.patientId();
    if (!patientId) {
      this.error.set('Abra o cree una atención con paciente antes de sellar.');
      return false;
    }
    if (!template) {
      this.error.set('Seleccione una plantilla legal.');
      return false;
    }
    if (!this.patientPad || this.patientPad.isEmpty()) {
      this.error.set('Falta la firma del paciente.');
      return false;
    }
    const professionalSignature =
      this.professionalPad && !this.professionalPad.isEmpty()
        ? this.professionalPad.toDataURL('image/png')
        : this.professionalSignature();
    if (!professionalSignature) {
      this.error.set('Falta la firma de la Dra / profesional.');
      return false;
    }

    this.submitting.set(true);
    try {
      const signatureBase64 = this.patientPad.toDataURL('image/png');
      const professionalSignatureBase64 = professionalSignature;
      const result = await firstValueFrom(
        this.api.signPatientConsent({
          patientId,
          templateId: template.id,
          encounterId: this.encounterId() ?? undefined,
          signerName: this.signerName.trim() || undefined,
          signerDocumentType: this.signerDocumentType || undefined,
          signerDocument: this.signerDocument.trim() || undefined,
          signatureBase64,
          professionalSignatureBase64,
        }),
      );

      this.message.set(
        result.message || 'Documento aceptado, firmado y sellado como PDF inalterable.',
      );
      this.sealed.emit(result);
      this.flagsChanged.emit();
      this.clearSignatures();
      await this.reload();
      return true;
    } catch (err) {
      const http = err as HttpErrorResponse;
      this.error.set(
        http?.error?.message ||
          'No se pudo sellar el documento. Verifique la atención y vuelva a intentar.',
      );
      return false;
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
   * Rellena guiones del texto legal con datos del paciente/firmante (vista previa).
   * Misma lógica que api/.../consent-placeholders.ts para el PDF sellado.
   */
  private fillTemplatePlaceholders(html: string): string {
    const name = (this.signerName.trim() || this.patientName().trim() || '').replace(/\s+/g, ' ');
    const docType = this.signerDocumentType || this.patientDocumentType() || 'CC';
    const docNum = this.signerDocument.trim() || this.patientDocument().trim() || '';
    const city = (this.patientCity().trim() || 'Manizales').replace(/\s+/g, ' ');
    const patient = this.patientName().trim().replace(/\s+/g, ' ') || name;
    const professional = this.professionalName().trim() || this.userFullName().trim() || '';
    const card = this.professionalCard().trim() || 'Pendiente';
    const today = new Date().toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const missing = !name || !docNum;
    let out = html;

    out = out.replace(
      /(<strong>Ciudad y Fecha:<\/strong>\s*)_+/gi,
      `$1<strong>${this.escapeHtml(city)}, ${this.escapeHtml(today)}</strong>`,
    );

    out = out.replace(
      /(Yo,\s*|Nosotros \(o Yo\),\s*)_{10,}/i,
      `$1<strong class="filled">${this.escapeHtml(name || '[Nombre del firmante]')}</strong>`,
    );
    out = out.replace(
      /(C\.C\. \/ C\.E\. \/ T\.I\. No\.|C\.C\. \/ C\.E\. No\.|C\.C\. No\.|documento No\.)\s*_{5,}/gi,
      `$1 <strong class="filled">${this.escapeHtml(`${docType} ${docNum || '[Número]'}`)}</strong>`,
    );
    out = out.replace(
      /(\bde\s)_{5,}(,|\s)/gi,
      `$1<strong class="filled">${this.escapeHtml(city)}</strong>$2`,
    );
    out = out.replace(
      /(menor\/paciente|menor|representado\(a\))\s*_{10,}/gi,
      `$1 <strong class="filled">${this.escapeHtml(patient || '[Paciente / menor]')}</strong>`,
    );
    out = out.replace(
      /(psicólogo\(a\)\s*)_{5,}/gi,
      `$1<strong class="filled">${this.escapeHtml(professional || '[Profesional]')}</strong>`,
    );
    out = out.replace(
      /(Tarjeta Profesional No\.\s*)_{5,}/gi,
      `$1<strong class="filled">${this.escapeHtml(card)}</strong>`,
    );

    const queue = [
      name || '[Nombre]',
      `${docType} ${docNum || '[Número]'}`,
      city,
      patient || name || '[Paciente]',
      professional || '[Profesional]',
      card,
      name || '[Nombre]',
      `${docType} ${docNum || '[Número]'}`,
      professional || '[Profesional]',
      card,
    ];
    let i = 0;
    out = out.replace(/_{5,}/g, () => {
      const value = queue[Math.min(i, queue.length - 1)] || '—';
      i += 1;
      return `<strong class="filled">${this.escapeHtml(value)}</strong>`;
    });

    if (missing) {
      out =
        `<p style="color:#8a1f1f;font-size:12px;margin:0 0 10px"><strong>Faltan datos del paciente.</strong> Abra una atención arriba o complete nombre y documento del firmante.</p>` +
        out;
    }

    return out;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private destroyPads() {
    this.patientPad?.off();
    this.professionalPad?.off();
    this.patientPad = null;
    this.professionalPad = null;
  }

  private initPads() {
    this.destroyPads();
    this.patientPad = this.createPad(this.patientPadCanvas?.nativeElement, (has) =>
      this.hasPatientStroke.set(has),
    );
    this.professionalPad = this.createPad(this.professionalPadCanvas?.nativeElement, (has) => {
      this.hasProfessionalStroke.set(has);
      const pad = this.professionalPad;
      if (!has || !pad || pad.isEmpty()) return;
      const dataUrl = pad.toDataURL('image/png');
      this.appliedProfessionalSignature = dataUrl;
      this.professionalSigned.emit(dataUrl);
    });
    const incoming = this.professionalSignature();
    if (incoming) this.drawProfessionalSignature(incoming);
  }

  private createPad(
    canvas: HTMLCanvasElement | undefined,
    setHasStroke: (has: boolean) => void,
  ): SignaturePad | null {
    if (!canvas) return null;

    this.fitCanvas(canvas);

    const pad = new SignaturePad(canvas, {
      backgroundColor: 'rgb(255, 255, 255)',
      penColor: 'rgb(16, 24, 40)',
      minWidth: 0.8,
      maxWidth: 2.5,
      throttle: 0,
    });

    pad.addEventListener('beginStroke', () => setHasStroke(true));
    pad.addEventListener('endStroke', () => setHasStroke(!pad.isEmpty()));
    setHasStroke(false);
    return pad;
  }

  private fitCanvases() {
    if (this.patientPadCanvas?.nativeElement) {
      this.fitCanvas(this.patientPadCanvas.nativeElement);
      this.patientPad?.clear();
      this.hasPatientStroke.set(false);
    }
    if (this.professionalPadCanvas?.nativeElement) {
      this.fitCanvas(this.professionalPadCanvas.nativeElement);
      this.professionalPad?.clear();
      this.hasProfessionalStroke.set(false);
    }
  }

  private fitCanvas(canvas: HTMLCanvasElement) {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(Math.floor(rect.width), canvas.clientWidth, 280);
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
  }
}
