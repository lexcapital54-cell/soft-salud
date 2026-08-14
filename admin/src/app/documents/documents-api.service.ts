import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { retry, throwError, timer } from 'rxjs';
import { API } from '../api.config';
import {
  DocumentFileDetail,
  DocumentSignerRole,
  DocumentsOverview,
  FillSgsstPayload,
  FillTrainingActaPayload,
  RequirementDetail,
  SignedArchive,
} from './documents.models';

function retryOnDisconnect<T>() {
  return retry<T>({
    count: 2,
    delay: (error: HttpErrorResponse, attempt) =>
      error.status === 0 ? timer(attempt * 700) : throwError(() => error),
  });
}

@Injectable({ providedIn: 'root' })
export class DocumentsApiService {
  /** Cuando el superadmin administra un consultorio concreto. */
  clinicId: string | null = null;

  constructor(private readonly http: HttpClient) {}

  private withClinic(url: string, extra?: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    if (this.clinicId) params.set('clinicId', this.clinicId);
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        if (value) params.set(key, value);
      }
    }
    const qs = params.toString();
    if (!qs) return url;
    return url.includes('?') ? `${url}&${qs}` : `${url}?${qs}`;
  }

  overview() {
    return this.http
      .get<DocumentsOverview>(this.withClinic(`${API}/documents/overview`))
      .pipe(retryOnDisconnect());
  }

  signedArchive(period?: string) {
    return this.http
      .get<SignedArchive>(
        this.withClinic(`${API}/documents/signed-archive`, { period }),
      )
      .pipe(retryOnDisconnect());
  }

  listFiles(requirementId: string) {
    return this.http
      .get<RequirementDetail>(
        this.withClinic(`${API}/documents/requirements/${requirementId}/files`),
      )
      .pipe(retryOnDisconnect());
  }

  getFile(fileId: string) {
    return this.http
      .get<DocumentFileDetail>(this.withClinic(`${API}/documents/files/${fileId}`))
      .pipe(retryOnDisconnect());
  }

  upload(
    requirementId: string,
    file: File,
    meta?: { expiresAt?: string; periodLabel?: string; notes?: string },
  ) {
    const form = new FormData();
    form.append('file', file);
    if (meta?.expiresAt) form.append('expiresAt', meta.expiresAt);
    if (meta?.periodLabel) form.append('periodLabel', meta.periodLabel);
    if (meta?.notes) form.append('notes', meta.notes);
    return this.http.post<RequirementDetail>(
      this.withClinic(`${API}/documents/requirements/${requirementId}/files`),
      form,
    );
  }

  sign(
    fileId: string,
    role: DocumentSignerRole,
    signatureBase64: string,
    signerName?: string,
  ) {
    return this.http.post<DocumentFileDetail>(
      this.withClinic(`${API}/documents/files/${fileId}/sign`),
      { role, signatureBase64, signerName },
    );
  }

  fillSgsst(requirementId: string, payload: FillSgsstPayload) {
    return this.http.post<DocumentFileDetail>(
      this.withClinic(`${API}/documents/requirements/${requirementId}/fill-sgsst`),
      payload,
    );
  }

  fillTrainingActa(requirementId: string, payload: FillTrainingActaPayload) {
    return this.http.post<DocumentFileDetail>(
      this.withClinic(
        `${API}/documents/requirements/${requirementId}/fill-training-acta`,
      ),
      payload,
    );
  }

  viewBlob(fileId: string) {
    return this.http.get(this.withClinic(`${API}/documents/files/${fileId}/view`), {
      responseType: 'blob',
    });
  }

  previewHtml(fileId: string) {
    return this.http.get<{ html: string; originalName: string; version: number }>(
      this.withClinic(`${API}/documents/files/${fileId}/preview-html`),
    );
  }

  downloadBlob(fileId: string) {
    return this.http.get(
      this.withClinic(`${API}/documents/files/${fileId}/download`),
      { responseType: 'blob' },
    );
  }

  retire(fileId: string) {
    return this.http.post<RequirementDetail>(
      this.withClinic(`${API}/documents/files/${fileId}/remove`),
      {},
    );
  }

  setRequirementEnabled(requirementId: string, enabled: boolean) {
    return this.http.post<DocumentsOverview>(
      this.withClinic(`${API}/documents/requirements/${requirementId}/enabled`),
      { enabled },
    );
  }

  setAllEnabled(enabled: boolean) {
    return this.http.post<DocumentsOverview>(
      this.withClinic(`${API}/documents/requirements/enable-all`),
      { enabled },
    );
  }
}
