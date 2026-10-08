import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API } from '../api.config';
import { ActivityItem, DocCategory, PillarKey, Registry } from './habilitation.models';

@Injectable({ providedIn: 'root' })
export class HabilitationApiService {
  private readonly http = inject(HttpClient);
  /** Consultorio administrado por el superadmin (los demás roles usan el de su sesión). */
  clinicId: string | null = null;

  private url(path: string, extra?: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    if (this.clinicId) params.set('clinicId', this.clinicId);
    for (const [k, v] of Object.entries(extra ?? {})) if (v) params.set(k, v);
    const qs = params.toString();
    return `${API}/documents/registry${path}${qs ? `?${qs}` : ''}`;
  }

  registry() {
    return this.http.get<Registry>(this.url(''));
  }

  activity(requirementId?: string, limit = 20) {
    return this.http.get<ActivityItem[]>(this.url('/activity', { requirementId, limit: String(limit) }));
  }

  createDocument(body: {
    categoryId: string;
    title: string;
    code?: string;
    description?: string;
    responsibleName?: string;
    responsibleArea?: string;
    validityDays?: number;
  }) {
    return this.http.post<{ id: string; code: string }>(this.url('/documents'), body);
  }

  updateDocument(
    id: string,
    body: {
      title?: string;
      code?: string;
      description?: string;
      categoryId?: string;
      responsibleName?: string;
      responsibleArea?: string;
      validityDays?: number | null;
    },
  ) {
    return this.http.post<{ id: string; changed: boolean }>(this.url(`/documents/${id}/update`), body);
  }

  /** Eliminación definitiva por selección (superadmin). */
  bulkDelete(ids: string[], mode: 'files' | 'documents') {
    return this.http.post<{ mode: string; documents: number; files: number }>(this.url('/documents/bulk-delete'), { ids, mode });
  }

  setArchived(id: string, archived: boolean) {
    return this.http.post<{ id: string; archivedAt: string | null }>(this.url(`/documents/${id}/archive`), { archived });
  }

  exportMasterList(format: 'xlsx' | 'pdf', includeArchived = false) {
    return this.http.get(this.url(`/master-list.${format}`, { archived: includeArchived ? 'true' : undefined }), {
      responseType: 'blob',
      observe: 'response',
    });
  }

  categories() {
    return this.http.get<DocCategory[]>(`${API}/documents/registry/categories`);
  }

  createCategory(body: { name: string; pillar: PillarKey }) {
    return this.http.post<DocCategory>(`${API}/documents/registry/categories`, body);
  }

  updateCategory(id: string, body: { name?: string; pillar?: PillarKey; isActive?: boolean }) {
    return this.http.post<DocCategory>(`${API}/documents/registry/categories/${id}/update`, body);
  }
}
