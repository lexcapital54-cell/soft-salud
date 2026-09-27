import { DatePipe } from '@angular/common';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ClinicalApiService } from './clinical-api.service';
import { OpenEncounterItem } from './clinical.models';

@Component({
  selector: 'app-open-encounters-alert',
  imports: [RouterLink, DatePipe],
  templateUrl: './open-encounters-alert.html',
  styleUrl: './open-encounters-alert.scss',
})
export class OpenEncountersAlert implements OnInit {
  private readonly api = inject(ClinicalApiService);

  /** compact = solo badge; full = lista expandible */
  readonly mode = input<'compact' | 'full'>('full');

  readonly items = signal<OpenEncounterItem[]>([]);
  readonly loading = signal(true);
  readonly expanded = signal(false);

  ngOnInit() {
    this.api.listOpenEncounters().subscribe({
      next: (rows) => {
        this.items.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.items.set([]);
        this.loading.set(false);
      },
    });
  }

  count() {
    return this.items().length;
  }

  toggle() {
    this.expanded.update((v) => !v);
  }

  urgencyClass(days: number) {
    if (days >= 7) return 'urgent';
    if (days >= 3) return 'warn';
    return '';
  }
}
