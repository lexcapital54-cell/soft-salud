import { Component, inject } from '@angular/core';
import { AuthService } from '../auth.service';
import { ClinicSwitcher } from '../clinic-switcher';
import { AssistantsCard } from './assistants-card';
import { WEBSITE_URL } from '../api.config';

@Component({
  selector: 'app-clinic-settings',
  imports: [ClinicSwitcher, AssistantsCard],
  templateUrl: './clinic-settings.html',
  styleUrl: './clinic-settings.scss',
})
export class ClinicSettings {
  private readonly auth = inject(AuthService);

  readonly websiteUrl = WEBSITE_URL;
  readonly isClinicAdmin = this.auth.isClinicAdmin;
  readonly canWriteClinical = this.auth.canWriteClinical;

  onClinicSwitched() {
    window.location.reload();
  }
}
