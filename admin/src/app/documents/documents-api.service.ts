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
  constructor(private readonly http: HttpClient) {}

  overview() {
    return this.http
      .get<DocumentsOverview>(`${API}/documents/overview`)
      .pipe(retryOnDisconnect());
  }

  /** Histórico mensual de firmados para auditoría. */
  signedArchive(period?: string) {
    const q = period ? `?period=${encodeURIComponent(period)}` : '';
    return this.http
      .get<SignedArchive>(`${API}/documents/signed-archive${q}`)
      .pipe(retryOnDisconnect());
  }

  listFiles(requirementId: string) {
    return this.http
      .get<RequirementDetail>(`${API}/documents/requirements/${requirementId}/files`)
      .pipe(retryOnDisconnect());
  }

  getFile(fileId: string) {
    return this.http
      .get<DocumentFileDetail>(`${API}/documents/files/${fileId}`)
      .pipe(retryOnDisconnect());
  }

  /** CREATE: nueva versión (no sobrescribe). */
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
      `${API}/documents/requirements/${requirementId}/files`,
      form,
    );
  }

  sign(fileId: string, role: DocumentSignerRole, signatureBase64: string, signerName?: string) {
    return this.http.post<DocumentFileDetail>(`${API}/documents/files/${fileId}/sign`, {
      role,
      signatureBase64,
      signerName,
    });
  }

  /** Llena cualquier documento SG-SST y genera PDF con firmas pegadas. */
  fillSgsst(requirementId: string, payload: FillSgsstPayload) {
    return this.http.post<DocumentFileDetail>(
      `${API}/documents/requirements/${requirementId}/fill-sgsst`,
      payload,
    );
  }

  /** Alias de actas (Capacitador + Asistente). */
  fillTrainingActa(requirementId: string, payload: FillTrainingActaPayload) {
    return this.http.post<DocumentFileDetail>(
      `${API}/documents/requirements/${requirementId}/fill-training-acta`,
      payload,
    );
  }

  /** Blob para ver inline (PDF / imagen). */
  viewBlob(fileId: string) {
    return this.http.get(`${API}/documents/files/${fileId}/view`, {
      responseType: 'blob',
    });
  }

  previewHtml(fileId: string) {
    return this.http.get<{ html: string; originalName: string; version: number }>(
      `${API}/documents/files/${fileId}/preview-html`,
    );
  }

  downloadBlob(fileId: string) {
    return this.http.get(`${API}/documents/files/${fileId}/download`, {
      responseType: 'blob',
    });
  }

  retire(fileId: string) {
    return this.http.post<RequirementDetail>(`${API}/documents/files/${fileId}/remove`, {});
  }
}
