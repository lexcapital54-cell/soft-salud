import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API } from '../api.config';
import { MembershipType } from '../models';

export type HourlyBookingStatus = 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface ClinicRoom {
  id: string;
  clinicId: string;
  name: string;
  code: string | null;
  capacity: number;
  notes: string | null;
  isActive: boolean;
}

export interface HourlyProfessional {
  id: string;
  fullName: string;
  email: string;
  role: string;
  membershipType: MembershipType;
  hoursUsedThisMonth?: number;
  hoursRemainingThisMonth?: number;
  hoursLimitThisMonth?: number;
}

export interface HourlyBooking {
  id: string;
  clinicId: string;
  professionalId: string;
  roomId: string | null;
  startTime: string;
  endTime: string;
  status: HourlyBookingStatus;
  notes: string | null;
  professional?: { id: string; fullName: string; membershipType: MembershipType };
  room?: { id: string; name: string; code: string | null } | null;
}

export interface HourlyRentalSettings {
  clinicId: string;
  hourlyMaxConcurrentRooms: number;
  hourlyMaxHoursPerMonth: number;
  activeRooms: number;
}

export interface UpsertRoomPayload {
  name: string;
  code?: string;
  capacity?: number;
  notes?: string;
}

export interface CreateBookingPayload {
  professionalId: string;
  roomId?: string;
  startTime: string;
  endTime: string;
  notes?: string;
}

export interface UpdateBookingPayload {
  roomId?: string | null;
  startTime?: string;
  endTime?: string;
  status?: HourlyBookingStatus;
  notes?: string | null;
}

@Injectable({ providedIn: 'root' })
export class HourlyRentalApiService {
  private readonly http = inject(HttpClient);

  getSettings() {
    return this.http.get<HourlyRentalSettings>(`${API}/hourly-rental-settings`);
  }

  updateSettings(body: Partial<Pick<HourlyRentalSettings, 'hourlyMaxConcurrentRooms' | 'hourlyMaxHoursPerMonth'>>) {
    return this.http.put<HourlyRentalSettings>(`${API}/hourly-rental-settings`, body);
  }

  listRooms() {
    return this.http.get<ClinicRoom[]>(`${API}/clinic-rooms`);
  }

  createRoom(body: UpsertRoomPayload) {
    return this.http.post<ClinicRoom>(`${API}/clinic-rooms`, body);
  }

  updateRoom(id: string, body: UpsertRoomPayload) {
    return this.http.put<ClinicRoom>(`${API}/clinic-rooms/${id}`, body);
  }

  setRoomActive(id: string, isActive: boolean) {
    return this.http.patch<ClinicRoom>(`${API}/clinic-rooms/${id}/active`, { isActive });
  }

  listHourlyProfessionals(month?: string) {
    let params = new HttpParams();
    if (month) params = params.set('month', month);
    return this.http.get<HourlyProfessional[]>(`${API}/hourly-professionals`, { params });
  }

  listBookings(opts?: { professionalId?: string; from?: string; to?: string }) {
    let params = new HttpParams();
    if (opts?.professionalId) params = params.set('professionalId', opts.professionalId);
    if (opts?.from) params = params.set('from', opts.from);
    if (opts?.to) params = params.set('to', opts.to);
    return this.http.get<HourlyBooking[]>(`${API}/hourly-bookings`, { params });
  }

  createBooking(body: CreateBookingPayload) {
    return this.http.post<HourlyBooking>(`${API}/hourly-bookings`, body);
  }

  updateBooking(id: string, body: UpdateBookingPayload) {
    return this.http.patch<HourlyBooking>(`${API}/hourly-bookings/${id}`, body);
  }
}
