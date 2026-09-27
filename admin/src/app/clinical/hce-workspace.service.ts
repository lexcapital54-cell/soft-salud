import { Injectable, signal } from '@angular/core';

export interface HceTab {
  key: string;
  patientId: string | null;
  encounterId: string | null;
  label: string;
}

let tabSeq = 0;

function nextTabKey() {
  tabSeq += 1;
  return `hce-tab-${tabSeq}-${Date.now().toString(36)}`;
}

/**
 * Estado compartido del workspace multi-pestaña de HCE.
 * Cada pestaña monta su propia instancia de ClinicalHistory (estado aislado).
 */
@Injectable({ providedIn: 'root' })
export class HceWorkspaceService {
  readonly tabs = signal<HceTab[]>([]);
  readonly activeKey = signal<string | null>(null);

  ensureBlankTab() {
    if (this.tabs().length) return this.activeKey();
    return this.openBlank();
  }

  openBlank() {
    const tab: HceTab = {
      key: nextTabKey(),
      patientId: null,
      encounterId: null,
      label: 'Nueva historia',
    };
    this.tabs.update((rows) => [...rows, tab]);
    this.activeKey.set(tab.key);
    return tab.key;
  }

  openPatient(patientId: string, label?: string) {
    const existing = this.tabs().find((t) => t.patientId === patientId);
    if (existing) {
      this.activeKey.set(existing.key);
      return existing.key;
    }
    const tab: HceTab = {
      key: nextTabKey(),
      patientId,
      encounterId: null,
      label: label?.trim() || 'Historia clínica',
    };
    this.tabs.update((rows) => [...rows, tab]);
    this.activeKey.set(tab.key);
    return tab.key;
  }

  openEncounter(encounterId: string, patientId?: string | null, label?: string) {
    const existing = this.tabs().find((t) => t.encounterId === encounterId);
    if (existing) {
      this.activeKey.set(existing.key);
      return existing.key;
    }
    if (patientId) {
      const byPatient = this.tabs().find((t) => t.patientId === patientId);
      if (byPatient) {
        this.tabs.update((rows) =>
          rows.map((t) =>
            t.key === byPatient.key
              ? {
                  ...t,
                  encounterId,
                  label: label?.trim() || t.label,
                }
              : t,
          ),
        );
        this.activeKey.set(byPatient.key);
        return byPatient.key;
      }
    }
    const tab: HceTab = {
      key: nextTabKey(),
      patientId: patientId ?? null,
      encounterId,
      label: label?.trim() || 'Historia clínica',
    };
    this.tabs.update((rows) => [...rows, tab]);
    this.activeKey.set(tab.key);
    return tab.key;
  }

  activate(key: string) {
    if (this.tabs().some((t) => t.key === key)) {
      this.activeKey.set(key);
    }
  }

  setLabel(key: string, label: string) {
    const clean = label.trim() || 'Historia clínica';
    this.tabs.update((rows) =>
      rows.map((t) => (t.key === key ? { ...t, label: clean } : t)),
    );
  }

  bindPatient(key: string, patientId: string, label?: string) {
    this.tabs.update((rows) =>
      rows.map((t) =>
        t.key === key
          ? {
              ...t,
              patientId,
              label: label?.trim() || t.label,
            }
          : t,
      ),
    );
  }

  close(key: string) {
    const rows = this.tabs();
    const idx = rows.findIndex((t) => t.key === key);
    if (idx < 0) return;
    const next = rows.filter((t) => t.key !== key);
    this.tabs.set(next);
    if (!next.length) {
      this.openBlank();
      return;
    }
    if (this.activeKey() === key) {
      const neighbor = next[Math.max(0, idx - 1)] ?? next[0];
      this.activeKey.set(neighbor.key);
    }
  }
}
