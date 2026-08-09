import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { retry, throwError, timer } from 'rxjs';
import {
  AgendaProfessional,
  AppointmentAdmission,
  AppointmentStatus,
  CareModality,
  NotificationChannel,
  NotificationLogRow,
  PatientOption,
  TodayAppointment,
} from './agenda.models';
import { API } from '../api.config';

/** Reintenta solo cuando el navegador no obtuvo respuesta (status 0). */
function retryOnDisconnect<T>() {
  return retry<T>({
    count: 2,
    delay: (error: HttpErrorResponse, attempt) =>
      error.status === 0 ? timer(attempt * 700) : throwError(() => error),
  });
}

@Injectable({ providedIn: 'root' })
export class AgendaApiService {
  constructor(private readonly http: HttpClient) {}

  listToday(opts: {
    q?: string;
    status?: AppointmentStatus | '';
    date?: string;
    from?: string;
    to?: string;
  }) {
    let params = new HttpParams();
    if (opts.q) params = params.set('q', opts.q);
    if (opts.status) params = params.set('status', opts.status);
    if (opts.from) {
      params = params.set('from', opts.from).set('to', opts.to || opts.from);
    } else if (opts.date) {
      params = params.set('date', opts.date);
    }
    return this.http
      .get<TodayAppointment[]>(`${API}/appointments/today`, { params })
      .pipe(retryOnDisconnect());
  }

  searchPatients(q: string) {
    const params = q ? new HttpParams().set('q', q) : new HttpParams();
    return this.http.get<PatientOption[]>(`${API}/patients`, { params }).pipe(retryOnDisconnect());
  }

  /** Alta exprés: la ficha clínica se completa cuando el paciente asiste. */
  quickCreatePatient(body: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    documentType?: string;
    documentNumber?: string;
  }) {
    return this.http.post<PatientOption>(`${API}/patients/quick`, body);
  }

  listProfessionals() {
    return this.http
      .get<AgendaProfessional[]>(`${API}/appointments/professionals`)
      .pipe(retryOnDisconnect());
  }

  create(body: {
    patientId: string;
    professionalId?: string;
    startsAt: string;
    durationMinutes?: number;
    requestDate?: string;
    modality?: CareModality;
    meetingUrl?: string;
    reason?: string;
    notes?: string;
  }) {
    return this.http.post<TodayAppointment>(`${API}/appointments`, body);
  }

  /**
   * Va por POST y no por PATCH: hay proxies y antivirus que descartan PATCH y
   * el navegador falla sin llegar a enviar nada. Es idempotente en el backend
   * (si la cita ya está en ese estado la devuelve tal cual), así que también se
   * puede reintentar sin riesgo.
   */
  updateStatus(id: string, status: AppointmentStatus, reason?: string) {
    return this.http
      .post<TodayAppointment>(`${API}/appointments/${id}/status`, {
        status,
        ...(reason ? { reason } : {}),
      })
      .pipe(retryOnDisconnect());
  }

  registerAdmission(
    id: string,
    body: {
      habeasDataSigned: boolean;
      signedByName?: string;
      documentNumber?: string;
    },
  ) {
    return this.http.post<AppointmentAdmission>(`${API}/appointments/${id}/admission`, body);
  }

  listNotifications(appointmentId: string) {
    return this.http.get<NotificationLogRow[]>(`${API}/notifications/appointment/${appointmentId}`);
  }

  resendNotification(appointmentId: string, channel: NotificationChannel) {
    return this.http.post<NotificationLogRow[]>(`${API}/notifications/resend`, {
      appointmentId,
      channel,
    });
  }
}
