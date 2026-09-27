import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { API } from '../api.config';

export type PaymentMethod =
  | 'CASH'
  | 'TRANSFER'
  | 'CARD'
  | 'PSE'
  | 'NEQUI'
  | 'DAVIPLATA'
  | 'OTHER';

export type PlatformChargeKind = 'CLINIC_SETUP' | 'MONTHLY_HOSTING' | 'OTHER';
export type PlatformPlanVariant = 'WITHOUT_DOCS' | 'WITH_DOCS';

export interface PlatformFee {
  id: string;
  code: string;
  label: string;
  kind: PlatformChargeKind;
  kindLabel: string;
  plan: PlatformPlanVariant;
  planLabel: string;
  amount: number;
  currency: string;
  isActive: boolean;
}

export interface PlatformReceipt {
  id: string;
  number: string;
  clinicId: string;
  clinic: {
    id: string;
    name: string;
    specialty: string;
    dashboardType: string | null;
  } | null;
  kind: PlatformChargeKind;
  kindLabel: string;
  plan: PlatformPlanVariant;
  planLabel: string;
  description: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  methodLabel: string;
  paidAt: string;
  periodMonth: string | null;
  notes: string | null;
  createdBy: { id: string; fullName: string } | null;
  createdAt: string;
}

export interface MonthlyIncomeReport {
  year: number;
  currentMonth: {
    month: string;
    total: number;
    setup: number;
    hosting: number;
    other: number;
    count: number;
  };
  yearTotal: number;
  months: Array<{
    month: string;
    total: number;
    setup: number;
    hosting: number;
    other: number;
    count: number;
  }>;
}

export interface HostingStatusRow {
  clinicId: string;
  clinicName: string;
  dashboardType: string | null;
  plan: PlatformPlanVariant;
  periodMonth: string;
  status: 'PAID' | 'UNPAID' | 'SUSPENDED';
  receiptNumber: string | null;
  amountPaid: number | null;
  paidAt: string | null;
  hostingSuspendedAt: string | null;
  hostingDueNotifiedAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class PlatformBillingApiService {
  constructor(private readonly http: HttpClient) {}

  listFees() {
    return this.http.get<PlatformFee[]>(`${API}/platform-billing/fees`);
  }

  updateFee(id: string, body: { amount: number; label?: string }) {
    return this.http.patch<PlatformFee>(`${API}/platform-billing/fees/${id}`, body);
  }

  listReceipts(opts: { from?: string; to?: string; clinicId?: string } = {}) {
    let params = new HttpParams();
    if (opts.from) params = params.set('from', opts.from);
    if (opts.to) params = params.set('to', opts.to);
    if (opts.clinicId) params = params.set('clinicId', opts.clinicId);
    return this.http.get<PlatformReceipt[]>(`${API}/platform-billing/receipts`, {
      params,
    });
  }

  createReceipt(body: {
    clinicId: string;
    kind: PlatformChargeKind;
    plan: PlatformPlanVariant;
    description?: string;
    amount: number;
    method?: PaymentMethod;
    paidAt?: string;
    periodMonth?: string;
    notes?: string;
  }) {
    return this.http.post<PlatformReceipt>(`${API}/platform-billing/receipts`, body);
  }

  generateMonthlyHosting(body: {
    periodMonth: string;
    amount: number;
    method?: PaymentMethod;
    clinicId?: string;
  }) {
    return this.http.post<{
      periodMonth: string;
      createdCount: number;
      skippedCount: number;
      created: PlatformReceipt[];
      skipped: Array<{ clinicId: string; clinicName: string; reason: string }>;
    }>(`${API}/platform-billing/monthly-hosting/generate`, body);
  }

  hostingStatus(periodMonth: string) {
    return this.http.get<HostingStatusRow[]>(
      `${API}/platform-billing/hosting/status`,
      { params: new HttpParams().set('periodMonth', periodMonth) },
    );
  }

  notifyHostingDue(body: { periodMonth: string; clinicId?: string }) {
    return this.http.post<{
      periodMonth: string;
      count: number;
      results: Array<{
        clinicId: string;
        clinicName: string;
        notified: boolean;
        emails: string[];
        detail?: string;
      }>;
    }>(`${API}/platform-billing/hosting/notify-due`, body);
  }

  suspendUnpaidHosting(body: { periodMonth: string; clinicId?: string }) {
    return this.http.post<{
      periodMonth: string;
      suspendedCount: number;
      results: Array<{
        clinicId: string;
        clinicName: string;
        deactivatedUsers: number;
        emails: string[];
      }>;
    }>(`${API}/platform-billing/hosting/suspend-unpaid`, body);
  }

  monthlyIncome(year?: number) {
    let params = new HttpParams();
    if (year) params = params.set('year', String(year));
    return this.http.get<MonthlyIncomeReport>(
      `${API}/platform-billing/income/monthly`,
      { params },
    );
  }

  receiptPdfUrl(id: string) {
    return `${API}/platform-billing/receipts/${id}/pdf`;
  }
}
