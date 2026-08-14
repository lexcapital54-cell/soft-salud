import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { DocumentsApiService } from '../documents/documents-api.service';
import { DASHBOARD_TYPE_LABELS, SPECIALTY_LABELS } from '../models';
import { WEBSITE_URL } from '../api.config';

@Component({
  selector: 'app-clinic-home',
  imports: [RouterLink],
  templateUrl: './clinic-home.html',
  styleUrl: './clinic-home.scss',
})
export class ClinicHome {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly documentsApi = inject(DocumentsApiService);

  readonly user = this.auth.user;
  readonly labels = SPECIALTY_LABELS;
  readonly dashboardLabels = DASHBOARD_TYPE_LABELS;
  readonly pendingDocSignatures = signal(0);

  readonly hasDashboard = computed(() => !!this.user()?.dashboardType);
  readonly hasClinicalHistory = computed(
    () =>
      this.user()?.dashboardType === 'CLINICAL_HISTORY' ||
      this.user()?.dashboardType === 'CLINICAL_HISTORY_WITH_DOCS',
  );
  readonly hasDocuments = computed(
    () => this.user()?.dashboardType === 'CLINICAL_HISTORY_WITH_DOCS',
  );
  readonly canWriteClinical = this.auth.canWriteClinical;
  readonly canCountersign = this.auth.canCountersignDocuments;

  constructor() {
    this.auth.refreshMe().subscribe({
      next: () => this.loadPendingSignatures(),
      error: () => this.loadPendingSignatures(),
    });
  }

  private loadPendingSignatures() {
    if (!this.hasDocuments() || !this.canCountersign()) return;
    this.documentsApi.clinicId = null;
    this.documentsApi.overview().subscribe({
      next: (data) =>
        this.pendingDocSignatures.set(data.pendingCountersignatures?.length ?? 0),
      error: () => undefined,
    });
  }

  logout() {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }

  readonly websiteUrl = WEBSITE_URL;

  goHome() {
    this.auth.goToWebsite();
  }
}
