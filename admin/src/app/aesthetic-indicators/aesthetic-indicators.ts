import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { API } from '../api.config';
import { AuthService } from '../auth.service';
import { APPOINTMENT_STATUS_LABELS, AppointmentStatus } from '../agenda/agenda.models';
import { GLOGAU, SKIN_TYPES, procedureTypeLabel, zoneLabel } from '../clinical/aesthetic/aesthetic.models';
import { HabIcon } from '../habilitation/hab-icon';

type Count = { key: string; count: number };

export interface AestheticIndicators {
  period: { from: string; to: string };
  totals: {
    patients: number;
    newPatients: number;
    attendedPatients: number;
    encounters: number;
    signedRecords: number;
    procedures: number;
    signedProcedures: number;
    adverseEvents: number;
    upcomingControls: number;
    overdueControls: number;
    consentsSigned: number;
    appointments: number;
  };
  procedureTypes: Count[];
  zones: Count[];
  fitzpatrick: Count[];
  glogau: Count[];
  skinTypes: Count[];
  ageRanges: Count[];
  sex: Count[];
  appointmentStatus: Count[];
  topServices: Count[];
  monthly: Array<{ month: string; encounters: number; procedures: number }>;
  professionals: Array<{ id: string; name: string }>;
}

type Preset = 'mes' | 'trimestre' | 'anio' | 'doce' | 'custom';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Fecha de hoy en Bogotá (UTC-5). */
function todayIso() {
  return new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
}

function shiftMonths(day: string, months: number) {
  const d = new Date(`${day.slice(0, 8)}01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

const SIN_DATO = 'Sin dato';

@Component({
  selector: 'app-aesthetic-indicators',
  imports: [FormsModule, NgTemplateOutlet, RouterLink, HabIcon],
  templateUrl: './aesthetic-indicators.html',
  styleUrl: './aesthetic-indicators.scss',
})
export class AestheticIndicatorsPage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  readonly user = this.auth.user;
  readonly isAesthetic = computed(() => this.user()?.specialty === 'AESTHETIC');

  readonly presets: Array<{ key: Preset; label: string }> = [
    { key: 'mes', label: 'Este mes' },
    { key: 'trimestre', label: 'Últimos 3 meses' },
    { key: 'anio', label: 'Este año' },
    { key: 'doce', label: 'Últimos 12 meses' },
    { key: 'custom', label: 'Personalizado' },
  ];
  readonly preset = signal<Preset>('anio');
  from = '';
  to = '';
  professionalId = '';

  readonly data = signal<AestheticIndicators | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly noShowRate = computed(() => {
    const d = this.data();
    if (!d?.totals.appointments) return null;
    const n = d.appointmentStatus.find((s) => s.key === 'NO_SHOW')?.count ?? 0;
    return Math.round((n / d.totals.appointments) * 100);
  });

  readonly isEmpty = computed(() => {
    const t = this.data()?.totals;
    return !!t && !t.encounters && !t.procedures && !t.appointments && !t.newPatients;
  });

  readonly monthlyMax = computed(() => Math.max(1, ...(this.data()?.monthly ?? []).flatMap((m) => [m.encounters, m.procedures])));

  ngOnInit() {
    this.applyPreset('anio');
  }

  applyPreset(p: Preset) {
    this.preset.set(p);
    const today = todayIso();
    if (p === 'custom') {
      if (!this.from) this.from = shiftMonths(today, -2);
      if (!this.to) this.to = today;
      return;
    }
    this.to = today;
    this.from =
      p === 'mes' ? `${today.slice(0, 8)}01` : p === 'trimestre' ? shiftMonths(today, -2) : p === 'anio' ? `${today.slice(0, 4)}-01-01` : shiftMonths(today, -11);
    this.load();
  }

  load() {
    if (!this.from || !this.to || this.from > this.to) {
      this.error.set('Revise el periodo: la fecha inicial debe ser anterior a la final.');
      return;
    }
    let params = new HttpParams().set('from', this.from).set('to', this.to);
    if (this.professionalId) params = params.set('professionalId', this.professionalId);
    this.loading.set(true);
    this.error.set(null);
    this.http.get<AestheticIndicators>(`${API}/aesthetic-indicators`, { params }).subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: (e: HttpErrorResponse) => {
        const msg = typeof e.error?.message === 'string' ? e.error.message : null;
        this.error.set(e.status === 0 ? 'Sin conexión con el servidor. Intente de nuevo.' : msg || 'No se pudieron cargar los indicadores.');
        this.loading.set(false);
      },
    });
  }

  pct(n: number, list: Count[]) {
    const total = list.reduce((s, c) => s + c.count, 0);
    return total ? Math.round((n / total) * 100) : 0;
  }

  barWidth(n: number, list: Count[]) {
    const max = Math.max(1, ...list.map((c) => c.count));
    return `${Math.max(2, (n / max) * 100)}%`;
  }

  procLabel = (k: string) => procedureTypeLabel(k);
  zoneName = (k: string) => zoneLabel(k);
  fitzLabel = (k: string) => (k === SIN_DATO ? k : `Tipo ${k}`);
  glogauLabel = (k: string) => GLOGAU.find((g) => g.key === k)?.label || k;
  skinLabel = (k: string) => SKIN_TYPES.find((s) => s.key === k)?.label || k;
  statusLabel = (k: string) => APPOINTMENT_STATUS_LABELS[k as AppointmentStatus] || k;
  plain = (k: string) => k;

  monthLabel(m: string) {
    const [y, mm] = m.split('-');
    return `${MONTHS[Number(mm) - 1]} ${y.slice(2)}`;
  }

  periodLabel() {
    const d = this.data();
    if (!d) return '';
    const fmt = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    return `${fmt(d.period.from)} – ${fmt(d.period.to)}`;
  }
}
