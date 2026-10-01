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
import { ConsentCiDetails } from './consent-ci/consent-ci-details';
import { ciProgress, emptyCiDetails, isCiSpec } from './consent-ci/consent-ci.logic';
import { ConsentRevokeDialog } from './consent-ci/consent-revoke-dialog';
import { CiConsentDetails, ConsentTemplate, PatientConsentRecord } from './consent.models';
import { DOCUMENT_TYPES } from './document-types';

@Component({
  selector: 'app-consent-signer',
  imports: [FormsModule, DatePipe, ConsentCiDetails, ConsentRevokeDialog],
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
  /** Menor de 18: la firma legal la pone el acudiente (LEGAL_GUARDIAN). */
  readonly isMinor = input(false);
  readonly guardianFullName = input<string>('');
  readonly guardianDocumentType = input<string>('CC');
  readonly guardianDocumentNumber = input<string>('');
  readonly guardianRelationship = input<string>('');

  /** Firma del paciente ya capturada en servidor (borrador HCE). */
  readonly initialPatientSignature = input<string | null>(null);
  /** Firma de la profesional compartida con el panel «Firma digital (Ley 527)». */
  readonly professionalSignature = input<string | null>(null);
  /** Si se define, selecciona esa plantilla al cargar (p. ej. DISSENT_HOSPITALIZATION). */
  readonly preferredTemplateCode = input<string | null>(null);
  /** Modalidad de la atención (informativa; la firma virtual ya no depende de ella). */
  readonly careModality = input<'IN_PERSON' | 'VIRTUAL' | string>('IN_PERSON');
  readonly remoteInviteBusy = signal(false);
  readonly remoteInviteLink = signal<string | null>(null);
  readonly remoteInviteWhatsappUrl = signal<string | null>(null);
  readonly remoteInvitePhone = signal<string | null>(null);
  readonly remoteInviteCopied = signal(false);
  readonly remoteInviteId = signal<string | null>(null);
  readonly remoteInviteWaiting = signal(false);

  readonly sealed = output<PatientConsentRecord>();
  readonly flagsChanged = output<void>();
  /** Avisa a la HC del trazo de la Dra para reflejarlo en el otro panel. */
  readonly professionalSigned = output<string>();
  /** Avisa a la HC que la Dra borró su firma en este lienzo. */
  readonly professionalCleared = output<void>();
  /** Avisa a la HC cuando el paciente/acudiente firma (sidebar y cierre). */
  readonly patientSignatureChanged = output<string | null>();

  @ViewChild('signerPadCanvas')
  private signerPadCanvas?: ElementRef<HTMLCanvasElement>;
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
  /** Vista previa del trazo del paciente/acudiente (también en sidebar de la HC). */
  readonly patientSignaturePreview = signal<string | null>(null);

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
  /** Tras «Limpiar firma», no se vuelve a pintar la firma compartida hasta que la Dra firme de nuevo. */
  private readonly professionalCleared$ = signal(false);
  private remotePollTimer: ReturnType<typeof setInterval> | null = null;
  private remotePollStartedAt = 0;

  readonly selected = computed(
    () => this.templates().find((t) => t.id === this.selectedId()) ?? null,
  );

  @ViewChild(ConsentRevokeDialog)
  private revokeDialog?: ConsentRevokeDialog;
  readonly revokeTarget = signal<PatientConsentRecord | null>(null);

  /** Plantilla CI estructurada (CI-OD-001 / CI-ORT-002 / CI-CIR-003). */
  readonly ciSpec = computed(() => {
    const body = this.selected()?.bodyJson;
    return isCiSpec(body) ? body : null;
  });
  readonly ciDetails = signal<CiConsentDetails | null>(null);
  readonly ciMissing = computed(() => {
    const spec = this.ciSpec();
    const details = this.ciDetails();
    return spec && details ? ciProgress(spec, details).missing : [];
  });

  /** Firma que ya quedó sellada en un consentimiento (presencial o por WhatsApp). */
  private readonly sealedSignature = signal<string | null>(null);

  /** Hay consentimiento por sellar: plantilla y una firma nueva, aún no sellada. */
  readonly canSeal = computed(() => {
    if (!this.patientId() || !this.selected() || !this.hasPatientSignature()) return false;
    const sealed = this.sealedSignature();
    return !sealed || this.patientSignaturePreview() !== sealed;
  });

  primarySignerLabel() {
    return this.isMinor()
      ? 'Firma acudiente / representante legal'
      : 'Firma paciente';
  }

  signerRoleForApi(): 'PATIENT' | 'LEGAL_GUARDIAN' {
    return this.isMinor() ? 'LEGAL_GUARDIAN' : 'PATIENT';
  }

  hasPatientSignature() {
    return this.hasPatientStroke() || !!this.patientSignaturePreview();
  }

  /** Imagen actual de la firma del paciente (lienzo o copia recuperada). */
  currentPatientSignature(): string | null {
    if (this.patientPad && !this.patientPad.isEmpty()) {
      return this.patientPad.toDataURL('image/png');
    }
    return this.patientSignaturePreview();
  }

  hasProfessionalSignature() {
    return this.hasProfessionalStroke() || !!this.sharedProfessionalSignature();
  }

  private sharedProfessionalSignature(): string | null {
    return this.professionalCleared$() ? null : this.professionalSignature();
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
      const minor = this.isMinor();
      const guardianName = this.guardianFullName().trim();
      const guardianDoc = this.guardianDocumentNumber().trim();
      const guardianType = this.guardianDocumentType().trim() || 'CC';
      const name = this.patientName();
      const doc = this.patientDocument();
      const docType = this.patientDocumentType();
      void eid;

      if (minor) {
        this.signerName = guardianName;
        this.signerDocument = guardianDoc;
        this.signerDocumentType = guardianType;
      } else {
        this.signerName = (name || '').trim();
        this.signerDocument = (doc || '').trim();
        this.signerDocumentType = docType || 'CC';
      }

      this.sealedSignature.set(null);
      if (pid) {
        void this.loadSigned(pid);
      } else {
        this.signed.set([]);
      }
    });

    effect(() => {
      const incoming = this.sharedProfessionalSignature();
      if (!incoming || incoming === this.appliedProfessionalSignature) return;
      this.appliedProfessionalSignature = incoming;
      this.drawProfessionalSignature(incoming);
    });

    effect(() => {
      const patientSig = this.initialPatientSignature();
      if (!patientSig || this.hasPatientSignature()) return;
      this.drawPatientSignature(patientSig);
    });

    effect(() => {
      const templates = this.templates();
      if (!templates.length) return;
      const current = templates.find((t) => t.id === this.selectedId());
      const minor = this.isMinor();
      // Solo corrige el par Adultos/NNA; no pisa Disentimiento u otras plantillas.
      if (!current) {
        this.selectedId.set(this.pickDefaultTemplateId(templates));
        return;
      }
      const isPsiPair = current.code === 'PSI_NNA' || current.code === 'PSI_ADULT';
      if (isPsiPair && (current.code === 'PSI_NNA') !== minor) {
        this.selectedId.set(this.pickDefaultTemplateId(templates));
      }
    });

    effect(() => {
      void this.isMinor();
      if (!this.ready) return;
      setTimeout(() => this.initPads(), 0);
    });

    effect(() => {
      const spec = this.ciSpec();
      const current = untracked(this.ciDetails);
      if (!spec) {
        if (current) this.ciDetails.set(null);
        return;
      }
      if (current?.code !== spec.code) this.ciDetails.set(emptyCiDetails(spec));
    });
  }

  /** Bloquea el sellado de un CI sin detalle completo y lleva al formulario. */
  private ciBlocked(): boolean {
    const missing = this.ciMissing();
    if (!this.ciSpec() || !missing.length) return false;
    this.error.set(`Complete el detalle del ${this.ciSpec()!.code}: ${missing.join(' · ')}.`);
    document
      .getElementById('consent-ci-details')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

  startRevoke(consent: PatientConsentRecord) {
    this.revokeTarget.set(consent);
    setTimeout(() => this.revokeDialog?.open(consent.signerName || this.signerName));
  }

  async onRevoked(result: PatientConsentRecord) {
    this.message.set(
      result.message || 'Consentimiento revocado. Se generó el PDF sellado de la revocatoria.',
    );
    this.revokeTarget.set(null);
    const pid = this.patientId();
    if (pid) await this.loadSigned(pid);
    this.flagsChanged.emit();
  }

  async openRevocationPdf(id: string) {
    this.error.set('');
    try {
      const blob = await firstValueFrom(this.api.downloadConsentRevocationPdf(id));
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      this.error.set('No se pudo abrir el PDF de la revocatoria.');
    }
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
    setTimeout(() => this.initPads(), 400);
  }

  /** El lienzo puede montarse oculto (pestaña): reiniciar al interactuar. */
  ensurePads() {
    if (!this.patientPad || !this.professionalPad) {
      this.initPads();
      return;
    }
    const canvas = this.signerCanvas();
    if (canvas && canvas.clientWidth < 40) {
      this.initPads();
    }
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.resizeHandler);
    this.stopRemoteInvitePolling();
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
      } else {
        const forced = this.preferredTemplateCode()?.trim();
        const forcedMatch = forced
          ? templates.find((t) => t.code === forced)
          : undefined;
        const preferred = forcedMatch?.id ?? this.pickDefaultTemplateId(templates);
        if (
          forcedMatch ||
          !this.selectedId() ||
          !templates.some((t) => t.id === this.selectedId())
        ) {
          this.selectedId.set(preferred);
        }
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
      this.restoreSignatureFromSealed(signed);
    } catch {
      this.signed.set([]);
    }
  }

  /** Si ya hay consentimiento sellado, recupera la firma para la vista previa y el borrador. */
  private restoreSignatureFromSealed(signed: PatientConsentRecord[]) {
    const encounterId = this.encounterId()?.trim();
    const match =
      (encounterId
        ? signed.find((row) => row.encounterId === encounterId && !!row.signatureBase64)
        : null) ||
      signed.find((row) => !!row.signatureBase64);
    const raw = match?.signatureBase64?.trim();
    if (!raw) return;
    const dataUrl = raw.startsWith('data:') ? raw : `data:image/png;base64,${raw}`;
    if (this.hasPatientSignature() && this.patientSignaturePreview() !== dataUrl) return;
    this.sealedSignature.set(dataUrl);
    if (this.patientSignaturePreview() === dataUrl) return;
    this.drawPatientSignature(dataUrl);
    this.storePatientSignature(dataUrl);
    this.patientSignatureChanged.emit(dataUrl);
  }

  private pickDefaultTemplateId(templates: ConsentTemplate[]) {
    const code = this.isMinor() ? 'PSI_NNA' : 'PSI_ADULT';
    const match = templates.find((t) => t.code === code);
    if (match) return match.id;
    const informed =
      templates.find((t) => t.code.startsWith('PSI_')) ??
      templates.find((t) => t.code.endsWith('_INFORMED'));
    return informed?.id ?? templates[0].id;
  }

  onSelectTemplate(id: string) {
    this.selectedId.set(id);
    this.message.set('');
    // La firma de la Dra es una sola para toda la atención: se conserva.
    this.clearPatientSignature();
  }

  /** Selecciona plantilla por código (p. ej. desde el botón de disentimiento). */
  selectTemplateByCode(code: string) {
    const match = this.templates().find((t) => t.code === code);
    if (!match) {
      this.error.set(
        `No se encontró la plantilla «${code}». Ejecute el seed de consentimientos.`,
      );
      return false;
    }
    this.onSelectTemplate(match.id);
    this.message.set(`Plantilla cargada: ${match.title}. Firme paciente/acudiente y profesional.`);
    return true;
  }

  clearSignatures() {
    this.clearPatientSignature();
    this.clearProfessionalSignature();
  }

  clearPatientSignature() {
    this.patientPad?.clear();
    this.hasPatientStroke.set(false);
    this.patientSignaturePreview.set(null);
    this.clearStoredPatientSignature();
    this.patientSignatureChanged.emit(null);
  }

  clearProfessionalSignature() {
    this.professionalPad?.clear();
    this.hasProfessionalStroke.set(false);
    this.appliedProfessionalSignature = null;
    this.professionalCleared$.set(true);
    this.professionalCleared.emit();
  }

  /** Genera enlace de firma virtual y abre WhatsApp con el teléfono del paciente. */
  async sendRemoteInvite() {
    this.error.set('');
    this.message.set('');
    this.remoteInviteCopied.set(false);
    const patientId = this.patientId();
    const encounterId = this.encounterId();
    const template = this.selected();
    if (!patientId || !encounterId) {
      this.error.set('Abra la atención del paciente antes de generar el enlace.');
      return;
    }
    if (!template) {
      this.error.set('Seleccione la plantilla legal a firmar.');
      return;
    }
    if (this.ciBlocked()) return;
    this.remoteInviteBusy.set(true);
    try {
      const res = await firstValueFrom(
        this.api.sendRemoteConsentInvite({
          patientId,
          encounterId,
          templateId: template.id,
          procedureDetails: this.ciDetails() ?? undefined,
        }),
      );
      this.remoteInviteId.set(res.id);
      this.remoteInviteLink.set(res.link);
      this.remoteInviteWhatsappUrl.set(res.whatsappUrl);
      this.remoteInvitePhone.set(res.sentToPhone);
      this.message.set(res.message);
      this.startRemoteInvitePolling(res.id);
      if (res.whatsappUrl && typeof window !== 'undefined') {
        window.open(res.whatsappUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      const http = err as HttpErrorResponse;
      this.error.set(
        http.error?.message || 'No se pudo generar el enlace de firma remota.',
      );
      this.remoteInviteId.set(null);
      this.remoteInviteLink.set(null);
      this.remoteInviteWhatsappUrl.set(null);
      this.remoteInvitePhone.set(null);
      this.stopRemoteInvitePolling();
    } finally {
      this.remoteInviteBusy.set(false);
    }
  }

  /** Lleva el scroll al bloque de firma virtual (desde el panel lateral). */
  focusRemoteInvite() {
    if (typeof document === 'undefined') return;
    document.getElementById('remote-patient-signature-invite')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }

  private startRemoteInvitePolling(inviteId: string) {
    this.stopRemoteInvitePolling();
    this.remoteInviteWaiting.set(true);
    this.remotePollStartedAt = Date.now();
    void this.pollRemoteInviteOnce(inviteId);
    this.remotePollTimer = setInterval(() => {
      void this.pollRemoteInviteOnce(inviteId);
    }, 4000);
  }

  private stopRemoteInvitePolling() {
    if (this.remotePollTimer) {
      clearInterval(this.remotePollTimer);
      this.remotePollTimer = null;
    }
    this.remoteInviteWaiting.set(false);
  }

  private async pollRemoteInviteOnce(inviteId: string) {
    // Deja de esperar tras 20 minutos.
    if (Date.now() - this.remotePollStartedAt > 20 * 60 * 1000) {
      this.stopRemoteInvitePolling();
      this.message.set(
        'Sigue pendiente la firma virtual. Cuando el paciente firme, pulse recargar o vuelva a abrir la HC.',
      );
      return;
    }
    try {
      const status = await firstValueFrom(this.api.getRemoteConsentInviteStatus(inviteId));
      if (status.status !== 'SIGNED') return;
      this.stopRemoteInvitePolling();
      const raw = status.signatureBase64?.trim();
      const dataUrl = raw
        ? raw.startsWith('data:')
          ? raw
          : `data:image/png;base64,${raw}`
        : null;
      if (dataUrl) {
        this.sealedSignature.set(dataUrl);
        this.drawPatientSignature(dataUrl);
        this.storePatientSignature(dataUrl);
        this.patientSignaturePreview.set(dataUrl);
      }
      const pid = this.patientId();
      if (pid) await this.loadSigned(pid);
      this.message.set('Firma virtual del paciente recibida y guardada en la historia.');
      const sealedRow = status.patientConsentId
        ? this.signed().find((s) => s.id === status.patientConsentId)
        : undefined;
      // La HC sellada oculta esta sección al recibir la firma: emitir todo junto, al final.
      if (dataUrl) this.patientSignatureChanged.emit(dataUrl);
      if (sealedRow) this.sealed.emit(sealedRow);
      this.flagsChanged.emit();
    } catch {
      // Silencioso: reintenta en el siguiente intervalo.
    }
  }

  async copyRemoteInviteLink() {
    const link = this.remoteInviteLink();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      this.remoteInviteCopied.set(true);
      window.setTimeout(() => this.remoteInviteCopied.set(false), 2500);
    } catch {
      this.error.set('No se pudo copiar. Seleccione el enlace y cópielo manualmente.');
    }
  }

  openRemoteWhatsapp() {
    const url = this.remoteInviteWhatsappUrl();
    if (!url || typeof window === 'undefined') return;
    window.open(url, '_blank', 'noopener,noreferrer');
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
    if (this.ciBlocked()) return false;
    const signatureBase64 = this.currentPatientSignature();
    if (!signatureBase64) {
      this.error.set(
        this.isMinor()
          ? 'Falta la firma del acudiente / representante legal.'
          : 'Falta la firma del paciente.',
      );
      return false;
    }
    const professionalSignature =
      this.professionalPad && !this.professionalPad.isEmpty()
        ? this.professionalPad.toDataURL('image/png')
        : this.sharedProfessionalSignature();
    if (!professionalSignature) {
      this.error.set('Falta la firma de la Dra / profesional.');
      return false;
    }

    this.submitting.set(true);
    try {
      const professionalSignatureBase64 = professionalSignature;
      const result = await firstValueFrom(
        this.api.signPatientConsent({
          patientId,
          templateId: template.id,
          encounterId: this.encounterId() ?? undefined,
          signerRole: this.signerRoleForApi(),
          signerName: this.signerName.trim() || undefined,
          signerDocumentType: this.signerDocumentType || undefined,
          signerDocument: this.signerDocument.trim() || undefined,
          signatureBase64,
          professionalSignatureBase64,
          procedureDetails: this.ciDetails() ?? undefined,
        }),
      );
      const spec = this.ciSpec();
      if (spec) this.ciDetails.set(emptyCiDetails(spec));

      this.message.set(
        result.message || 'Documento aceptado, firmado y sellado como PDF inalterable.',
      );
      // Conservar la firma en borrador/UI: no emitir null tras sellar.
      this.sealedSignature.set(signatureBase64);
      this.patientSignaturePreview.set(signatureBase64);
      this.storePatientSignature(signatureBase64);
      this.patientSignatureChanged.emit(signatureBase64);
      this.drawPatientSignature(signatureBase64);
      this.sealed.emit(result);
      this.flagsChanged.emit();
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
      /(menor\/paciente|menor|representado\(a\)|legal del paciente)\s*_{10,}/gi,
      `$1 <strong class="filled">${this.escapeHtml(patient || '[Paciente / menor]')}</strong>`,
    );
    out = out.replace(
      /((?:psicólogo\(a\)|odontólogo\(a\)|fisioterapeuta)\s*)_{5,}/gi,
      `$1<strong class="filled">${this.escapeHtml(professional || '[Profesional]')}</strong>`,
    );
    out = out.replace(
      /((?:Tarjeta|Registro) Profesional No\.\s*)_{5,}/gi,
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

  private signerCanvas(): HTMLCanvasElement | undefined {
    return this.signerPadCanvas?.nativeElement;
  }

  private initPads() {
    this.destroyPads();
    this.patientPad = this.createPad(this.signerCanvas(), (has) => {
      this.hasPatientStroke.set(has);
    }, () => this.syncPatientSignaturePreview());
    this.professionalPad = this.createPad(this.professionalPadCanvas?.nativeElement, (has) => {
      this.hasProfessionalStroke.set(has);
      const pad = this.professionalPad;
      if (!has || !pad || pad.isEmpty()) return;
      const dataUrl = pad.toDataURL('image/png');
      this.appliedProfessionalSignature = dataUrl;
      this.professionalCleared$.set(false);
      this.professionalSigned.emit(dataUrl);
    });
    const incoming = this.sharedProfessionalSignature();
    if (incoming) this.drawProfessionalSignature(incoming);
    this.restoreStoredPatientSignature();
    const draft = this.initialPatientSignature();
    if (draft && !this.hasPatientSignature()) this.drawPatientSignature(draft);
  }

  private createPad(
    canvas: HTMLCanvasElement | undefined,
    setHasStroke: (has: boolean) => void,
    onEndStroke?: () => void,
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

    // Solo sincronizar al terminar el trazo: al iniciar el pad está vacío y
    // un sync prematuro borraba la firma del borrador / vista previa.
    pad.addEventListener('beginStroke', () => setHasStroke(true));
    pad.addEventListener('endStroke', () => {
      const hasInk = !pad.isEmpty();
      setHasStroke(hasInk);
      onEndStroke?.();
    });
    setHasStroke(!pad.isEmpty());
    return pad;
  }

  private fitCanvases() {
    const patientSnapshot = this.currentPatientSignature();
    const signerCanvas = this.signerCanvas();
    if (signerCanvas) {
      this.fitCanvas(signerCanvas);
      this.patientPad?.clear();
      this.hasPatientStroke.set(false);
      if (patientSnapshot) this.drawPatientSignature(patientSnapshot);
    }
    const shared = this.sharedProfessionalSignature();
    if (this.professionalPadCanvas?.nativeElement) {
      this.fitCanvas(this.professionalPadCanvas.nativeElement);
      if (shared) {
        this.drawProfessionalSignature(shared);
      } else {
        this.professionalPad?.clear();
        this.hasProfessionalStroke.set(false);
      }
    }
  }

  private syncPatientSignaturePreview() {
    const fromPad =
      this.patientPad && !this.patientPad.isEmpty()
        ? this.patientPad.toDataURL('image/png')
        : null;
    // Nunca borrar una firma ya capturada solo porque el lienzo quedó vacío
    // (resize, re-init o inicio de trazo). La limpieza es explícita.
    if (!fromPad) return;
    this.patientSignaturePreview.set(fromPad);
    this.storePatientSignature(fromPad);
    this.patientSignatureChanged.emit(fromPad);
  }

  private drawPatientSignature(dataUrl: string) {
    const apply = () => {
      const pad = this.patientPad;
      const canvas = this.signerCanvas();
      if (!pad || !canvas) return;
      pad.clear();
      void pad.fromDataURL(dataUrl, {
        width: canvas.clientWidth,
        height: canvas.clientHeight,
      });
      this.hasPatientStroke.set(true);
      this.patientSignaturePreview.set(dataUrl);
    };
    if (this.patientPad) apply();
    else setTimeout(apply, 80);
  }

  private storageKeyForPatientSignature() {
    const encounterId = this.encounterId()?.trim();
    const patientId = this.patientId()?.trim();
    if (!encounterId && !patientId) return null;
    return `habilisalud_patient_sig_${encounterId || patientId}`;
  }

  private storePatientSignature(dataUrl: string) {
    const key = this.storageKeyForPatientSignature();
    if (!key) return;
    try {
      sessionStorage.setItem(key, dataUrl);
    } catch {
      // Cuota / modo privado: no bloquear la firma en pantalla.
    }
  }

  private clearStoredPatientSignature() {
    const key = this.storageKeyForPatientSignature();
    if (!key) return;
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore
    }
  }

  private restoreStoredPatientSignature() {
    if (this.hasPatientStroke() || this.patientSignaturePreview()) return;
    const key = this.storageKeyForPatientSignature();
    if (!key) return;
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) this.drawPatientSignature(stored);
    } catch {
      // ignore
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
