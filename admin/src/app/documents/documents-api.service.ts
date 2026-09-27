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

  /** Profesional aprobador del consultorio seleccionado (Aprobó). */
  getBrand() {
    return this.http
      .get<{
        clinicId: string;
        clinicName: string;
        professionalName: string;
        professionalCard: string | null;
        professionalUserId: string | null;
        elaboratedBy: string;
        hasSignature: boolean;
        signatureBase64: string | null;
        city: string | null;
      }>(this.withClinic(`${API}/documents/brand`))
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

  deleteFilePermanent(fileId: string) {
    return this.http.post<RequirementDetail>(
      this.withClinic(`${API}/documents/files/${fileId}/delete-permanent`),
      {},
    );
  }

  updateFileMeta(
    fileId: string,
    body: { expiresAt?: string; periodLabel?: string; notes?: string },
  ) {
    return this.http.post<RequirementDetail>(
      this.withClinic(`${API}/documents/files/${fileId}/update`),
      body,
    );
  }

  setRequirementEnabled(requirementId: string, enabled: boolean) {
    return this.http.post<DocumentsOverview>(
      this.withClinic(`${API}/documents/requirements/${requirementId}/enabled`),
      { enabled },
    );
  }

  setRequirementClinicSignature(
    requirementId: string,
    requiresClinicSignature: boolean,
  ) {
    return this.http.post<DocumentsOverview>(
      this.withClinic(
        `${API}/documents/requirements/${requirementId}/clinic-signature`,
      ),
      { requiresClinicSignature },
    );
  }

  setAllEnabled(enabled: boolean) {
    return this.http.post<DocumentsOverview>(
      this.withClinic(`${API}/documents/requirements/enable-all`),
      { enabled },
    );
  }

  listCategories() {
    return this.http.get<
      Array<{
        id: string;
        code: string;
        name: string;
        pillar: string;
        sortOrder: number;
      }>
    >(`${API}/documents/categories`);
  }

  getAssignmentCatalog(clinicId: string, sourceClinicId?: string) {
    const params = new URLSearchParams({ clinicId });
    if (sourceClinicId) params.set('sourceClinicId', sourceClinicId);
    return this.http.get<{
      clinic: { id: string; name: string; specialty: string };
      sourceClinic: { id: string; name: string; specialty: string } | null;
      peerClinics: Array<{ id: string; name: string }>;
      items: Array<{
        code: string;
        title: string;
        description: string | null;
        isMandatory: boolean;
        requiresClinicSignature: boolean;
        category: {
          id: string;
          code: string;
          name: string;
          pillar: string;
          sortOrder: number;
        };
        alreadyAssigned: boolean;
        assignedEnabled: boolean;
        assignedRequirementId: string | null;
      }>;
      selectedCodes: string[];
    }>(`${API}/documents/catalog?${params.toString()}`);
  }

  assignRequirements(
    clinicId: string,
    body: {
      codes: string[];
      syncDisabled?: boolean;
      sourceClinicId?: string;
    },
  ) {
    return this.http.post<{
      clinicId: string;
      created: number;
      enabled: number;
      disabled: number;
      skippedUnknown: number;
      selectedCount: number;
      overview: DocumentsOverview;
      catalog: {
        clinic: { id: string; name: string; specialty: string };
        sourceClinic: { id: string; name: string; specialty: string } | null;
        peerClinics: Array<{ id: string; name: string }>;
        items: Array<{
          code: string;
          title: string;
          description: string | null;
          isMandatory: boolean;
          requiresClinicSignature: boolean;
          category: {
            id: string;
            code: string;
            name: string;
            pillar: string;
            sortOrder: number;
          };
          alreadyAssigned: boolean;
          assignedEnabled: boolean;
          assignedRequirementId: string | null;
        }>;
        selectedCodes: string[];
      };
    }>(`${API}/documents/requirements/assign?clinicId=${encodeURIComponent(clinicId)}`, body);
  }

  createRequirement(body: {
    categoryId: string;
    code: string;
    title: string;
    description?: string;
    isMandatory?: boolean;
    requiresClinicSignature?: boolean;
  }) {
    return this.http.post<DocumentsOverview>(
      this.withClinic(`${API}/documents/requirements`),
      body,
    );
  }

  clearClinicDocuments() {
    return this.http.post<{
      clinicId: string;
      deletedRequirements: number;
      overview: DocumentsOverview;
    }>(this.withClinic(`${API}/documents/clear`), {});
  }

  replicateDocuments(body: {
    sourceClinicId: string;
    targetClinicIds?: string[];
    includeFiles?: boolean;
  }) {
    return this.http.post<{
      sourceClinicId: string;
      sourceClinicName: string;
      specialty: string;
      requirementCount: number;
      targets: Array<{
        clinicId: string;
        clinicName: string;
        created: number;
        updated: number;
        filesCopied: number;
      }>;
    }>(`${API}/documents/replicate`, body);
  }

  importMasterPack(opts: {
    clinicId: string;
    files?: File[];
    relativePaths?: string[];
    zip?: File | null;
    ensureStructure?: boolean;
  }) {
    const form = new FormData();
    if (opts.zip) {
      form.append('zip', opts.zip, opts.zip.name);
    }
    if (opts.files?.length) {
      for (const file of opts.files) {
        form.append('files', file, file.name);
      }
      if (opts.relativePaths?.length) {
        form.append('relativePaths', JSON.stringify(opts.relativePaths));
      }
    }
    form.append(
      'ensureStructure',
      opts.ensureStructure === false ? 'false' : 'true',
    );
    return this.http.post<{
      clinicId: string;
      clinicName: string;
      packRootHint: string;
      stats: {
        imported: number;
        skippedDup: number;
        skippedMeta: number;
        unmapped: string[];
        missingCode: string[];
        covered: number;
        totalRequirements: number;
      };
      overview: DocumentsOverview;
    }>(
      `${API}/documents/import-master-pack?clinicId=${encodeURIComponent(opts.clinicId)}`,
      form,
    );
  }
}
