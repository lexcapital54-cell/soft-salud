import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { DASHBOARD_TYPE_LABELS, SPECIALTY_LABELS } from '../models';

@Component({
  selector: 'app-clinic-home',
  imports: [RouterLink],
  templateUrl: './clinic-home.html',
  styleUrl: './clinic-home.scss',
})
export class ClinicHome {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly labels = SPECIALTY_LABELS;
  readonly dashboardLabels = DASHBOARD_TYPE_LABELS;

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

  constructor() {
    this.auth.refreshMe().subscribe({ error: () => undefined });
  }

  logout() {
    this.auth.logout();
    void this.router.navigateByUrl('/login');
  }

  goHome() {
    this.auth.goToWebsite();
  }
}
