import { Component, computed, inject } from '@angular/core';
import { AuthService } from '../auth.service';
import { ClinicSwitcher } from '../clinic-switcher';
import { AssistantsCard } from './assistants-card';
import { ServicesCard } from './services-card';
import { AgendaStaffCard } from './agenda-staff-card';
import { WEBSITE_URL } from '../api.config';

@Component({
  selector: 'app-clinic-settings',
  imports: [ClinicSwitcher, AssistantsCard, ServicesCard, AgendaStaffCard],
  templateUrl: './clinic-settings.html',
  styleUrl: './clinic-settings.scss',
})
export class ClinicSettings {
  private readonly auth = inject(AuthService);

  readonly websiteUrl = WEBSITE_URL;
  readonly isClinicAdmin = this.auth.isClinicAdmin;
  readonly canWriteClinical = this.auth.canWriteClinical;
  readonly isAesthetic = computed(() => this.auth.user()?.specialty === 'AESTHETIC');

  onClinicSwitched() {
    window.location.reload();
  }
}
