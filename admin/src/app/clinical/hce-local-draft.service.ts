import { Injectable } from '@angular/core';
import {
  CareModality,
  ClinicalContent,
  ClinicalNoteFormat,
  ConsentRow,
  DiagnosisRow,
  Patient,
  ProcedureRow,
} from './clinical.models';

export interface HceLocalDraft {
  version: 1;
  /** Atención en servidor (si ya existe). */
  encounterId?: string | null;
  /** Pestaña del workspace (borrador antes de tener encounter). */
  tabKey?: string | null;
  patientId: string;
  savedAt: string;
  noteFormat: ClinicalNoteFormat;
  content: ClinicalContent;
  diagnoses: DiagnosisRow[];
  procedures: ProcedureRow[];
  consents: ConsentRow[];
  modality: CareModality;
  serviceType: string;
  location: string;
  purpose: string;
  externalCause: string;
  generateRipsForThisEncounter: boolean;
  allergiesText: string;
  medicationsText: string;
  managementPlanText: string;
  patientForm: Partial<Patient>;
}

const ENCOUNTER_PREFIX = 'habilisalud_hce_draft_v1_';
const TAB_PREFIX = 'habilisalud_hce_tab_v1_';
const PATIENT_PREFIX = 'habilisalud_hce_patient_v1_';
/** Firmas/fotos base64: pesan cientos de KB y ya viajan al servidor; no van a localStorage. */
const MAX_INLINE_DATA_URL = 2048;

/** Todo el texto libre de un objeto anidado (p. ej. HC de fisioterapia). */
function collectText(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (value.trim() && !value.startsWith('data:')) out.push(value.trim());
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectText(v, out));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => collectText(v, out));
  }
  return out;
}

export type HceDraftLookup = {
  encounterId?: string | null;
  tabKey?: string | null;
  patientId?: string | null;
};

/**
 * Copia local de la HCE en el navegador: sobrevive a recargas, caídas del
 * servidor y cambio de pestaña antes de que termine el autoguardado remoto.
 */
@Injectable({ providedIn: 'root' })
export class HceLocalDraftService {
  encounterKey(encounterId: string) {
    return `${ENCOUNTER_PREFIX}${encounterId}`;
  }

  tabKey(key: string) {
    return `${TAB_PREFIX}${key}`;
  }

  patientKey(patientId: string) {
    return `${PATIENT_PREFIX}${patientId}`;
  }

  /**
   * Siempre se escribe también con el ID del paciente como llave: es lo único
   * estable tras una recarga (la llave de pestaña cambia en modo standalone).
   * Devuelve false si el navegador no permitió guardar (cuota / modo privado).
   */
  write(draft: HceLocalDraft): boolean {
    let payload: string;
    try {
      payload = JSON.stringify(
        { ...draft, version: 1 as const },
        (_key, value) =>
          typeof value === 'string' && value.length > MAX_INLINE_DATA_URL && value.startsWith('data:')
            ? ''
            : value,
      );
    } catch {
      return false;
    }
    try {
      if (draft.encounterId) {
        localStorage.setItem(this.encounterKey(draft.encounterId), payload);
        if (draft.tabKey) localStorage.removeItem(this.tabKey(draft.tabKey));
      } else if (draft.tabKey) {
        localStorage.setItem(this.tabKey(draft.tabKey), payload);
      }
      if (draft.patientId) {
        localStorage.setItem(this.patientKey(draft.patientId), payload);
      }
      return true;
    } catch {
      // Cuota llena / modo privado: no bloquear la edición.
      return false;
    }
  }

  /**
   * Borrador más reciente que pertenezca a esta atención: por atención, por
   * paciente (sin atención aún o la misma) o por pestaña del mismo paciente.
   */
  readForEncounter(encounterId: string, patientId: string, tabKey?: string | null): HceLocalDraft | null {
    const belongs = (d: HceLocalDraft | null) =>
      !!d && (!d.encounterId || d.encounterId === encounterId) && (!d.patientId || d.patientId === patientId);
    const candidates = [
      this.read(encounterId),
      this.readPatient(patientId),
      tabKey ? this.readTab(tabKey) : null,
    ].filter((d): d is HceLocalDraft => belongs(d));
    if (!candidates.length) return null;
    return candidates.sort(
      (a, b) => Date.parse(b.savedAt || '') - Date.parse(a.savedAt || ''),
    )[0];
  }

  read(encounterId: string): HceLocalDraft | null {
    return this.readRaw(this.encounterKey(encounterId), (parsed) =>
      parsed.encounterId === encounterId ? parsed : null,
    );
  }

  readTab(tabKey: string): HceLocalDraft | null {
    return this.readRaw(this.tabKey(tabKey), (parsed) =>
      parsed.tabKey === tabKey ? parsed : null,
    );
  }

  readPatient(patientId: string): HceLocalDraft | null {
    return this.readRaw(this.patientKey(patientId), (parsed) =>
      parsed.patientId === patientId ? parsed : null,
    );
  }

  /** Busca el borrador más reciente para el contexto dado. */
  readBest(ctx: HceDraftLookup): HceLocalDraft | null {
    const candidates: HceLocalDraft[] = [];
    if (ctx.encounterId) {
      const row = this.read(ctx.encounterId);
      if (row) candidates.push(row);
    }
    if (ctx.tabKey) {
      const row = this.readTab(ctx.tabKey);
      if (row) candidates.push(row);
    }
    if (ctx.patientId) {
      const row = this.readPatient(ctx.patientId);
      if (row) candidates.push(row);
    }
    if (!candidates.length) return null;
    return candidates.sort(
      (a, b) => Date.parse(b.savedAt || '') - Date.parse(a.savedAt || ''),
    )[0];
  }

  clear(encounterId: string) {
    try {
      localStorage.removeItem(this.encounterKey(encounterId));
    } catch {
      // ignore
    }
  }

  clearTab(tabKey: string) {
    try {
      localStorage.removeItem(this.tabKey(tabKey));
    } catch {
      // ignore
    }
  }

  clearPatient(patientId: string) {
    try {
      localStorage.removeItem(this.patientKey(patientId));
    } catch {
      // ignore
    }
  }

  clearAllFor(ctx: HceDraftLookup) {
    if (ctx.encounterId) this.clear(ctx.encounterId);
    if (ctx.tabKey) this.clearTab(ctx.tabKey);
    if (ctx.patientId) this.clearPatient(ctx.patientId);
  }

  /**
   * ¿El borrador local es más reciente que lo último conocido del servidor?
   * Si no hay updatedAt del servidor, se considera recuperable si hay contenido.
   */
  isNewerThanServer(draft: HceLocalDraft, serverUpdatedAt?: string | null) {
    if (!serverUpdatedAt) return this.hasMeaningfulClinicalContent(draft);
    const local = Date.parse(draft.savedAt);
    const server = Date.parse(serverUpdatedAt);
    if (Number.isNaN(local)) return false;
    if (Number.isNaN(server)) return this.hasMeaningfulClinicalContent(draft);
    return local > server + 500;
  }

  /** Texto clínico real (no solo metadatos vacíos). */
  hasMeaningfulClinicalContent(draft: HceLocalDraft) {
    const c = draft.content;
    const care = c.careMinimum;
    const soap = c.soap;
    const text = (v?: string | null) => !!(v || '').trim();
    if (
      text(care?.motive) ||
      text(care?.presentIllness) ||
      text(care?.systemsReview) ||
      text(c.mentalExam?.narrative) ||
      text(c.assessment?.impressionNarrative) ||
      text(c.assessment?.observations) ||
      (draft.managementPlanText || '').trim() ||
      (draft.allergiesText || '').trim() ||
      (draft.medicationsText || '').trim()
    ) {
      return true;
    }
    if (soap && (text(soap.subjective) || text(soap.objective) || text(soap.assessment) || text(soap.plan))) {
      return true;
    }
    if (collectText(c.physiotherapy).length) {
      return true;
    }
    if (draft.diagnoses?.some((d) => (d.cieCode || '').trim() || (d.description || '').trim())) {
      return true;
    }
    if (draft.procedures?.some((p) => (p.cupsCode || '').trim() || (p.description || '').trim())) {
      return true;
    }
    const flags = care?.antecedentFlags;
    if (
      flags &&
      ['personales', 'psiquiatricos', 'familiares', 'toxicos'].some((key) => {
        const row = (flags as Record<string, { applies?: boolean; detail?: string }>)[key];
        return row?.applies && text(row.detail);
      })
    ) {
      return true;
    }
    return false;
  }

  /** Cantidad aproximada de texto clínico (para no pisar la BD con borradores vacíos). */
  contentRichnessScore(draft: Pick<HceLocalDraft, 'content' | 'diagnoses' | 'procedures' | 'managementPlanText' | 'allergiesText' | 'medicationsText'>) {
    const c = draft.content;
    const care = c?.careMinimum;
    const soap = c?.soap;
    const mental = c?.mentalExam;
    const assessment = c?.assessment;
    const chunks = [
      care?.motive,
      care?.presentIllness,
      care?.systemsReview,
      care?.antecedents,
      mental?.narrative,
      mental?.appearance,
      mental?.behavior,
      mental?.speech,
      mental?.mood,
      assessment?.impressionNarrative,
      assessment?.observations,
      draft.managementPlanText,
      draft.allergiesText,
      draft.medicationsText,
      soap?.subjective,
      soap?.objective,
      soap?.assessment,
      soap?.plan,
      ...(c?.allergies || []),
      ...(c?.medications || []),
      ...(assessment?.managementPlan || []),
      ...collectText(c?.physiotherapy),
    ];
    let score = chunks.reduce((n, s) => n + (s || '').trim().length, 0);
    score += (draft.diagnoses?.length || 0) * 40;
    score += (draft.procedures?.length || 0) * 40;
    return score;
  }

  private readRaw(
    storageKey: string,
    validate: (draft: HceLocalDraft) => HceLocalDraft | null,
  ): HceLocalDraft | null {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as HceLocalDraft;
      if (parsed?.version !== 1) return null;
      return validate(parsed);
    } catch {
      return null;
    }
  }
}
