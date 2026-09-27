import { Injectable, OnDestroy } from '@angular/core';

/**
 * Aviso global al recargar/cerrar pestaña cuando hay trabajo sin confirmar.
 * En HCE multi-pestaña cada historia usa un scope propio para no bloquearse entre sí.
 */
@Injectable({ providedIn: 'root' })
export class UnsavedWorkService implements OnDestroy {
  private dirtyCount = 0;
  private readonly dirtyScopes = new Set<string>();

  private readonly onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!this.isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  };

  constructor() {
    window.addEventListener('beforeunload', this.onBeforeUnload);
  }

  ngOnDestroy() {
    window.removeEventListener('beforeunload', this.onBeforeUnload);
  }

  markDirty() {
    this.dirtyCount = Math.max(1, this.dirtyCount + 1);
  }

  /** Marca “hay cambios” sin incrementar de más (idempotente). */
  setDirty(dirty: boolean) {
    this.dirtyCount = dirty ? Math.max(1, this.dirtyCount) : 0;
  }

  /** Cambios pendientes de una pestaña/instancia concreta del workspace HCE. */
  setScopeDirty(scopeId: string, dirty: boolean) {
    if (!scopeId) return;
    if (dirty) this.dirtyScopes.add(scopeId);
    else this.dirtyScopes.delete(scopeId);
  }

  markClean() {
    this.dirtyCount = 0;
    this.dirtyScopes.clear();
  }

  isDirty() {
    return this.dirtyCount > 0 || this.dirtyScopes.size > 0;
  }
}
