import { HttpClient } from '@angular/common/http';
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

export interface BillingPatientRef {
  id: string;
  firstName: string;
  lastName: string;
  documentType?: string;
  documentNumber?: string;
}

export interface BillingReceipt {
  id: string;
  number: string;
  issuedAt: string | null;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  patient: BillingPatientRef;
  appointmentId: string | null;
  method: PaymentMethod;
  notes?: string | null;
  items: Array<{
    id?: string;
    description: string;
    cupsCode?: string | null;
    quantity: number;
    unitPrice: number;
    packageId?: string | null;
  }>;
}

export interface BillingExpense {
  id: string;
  category: string;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  notes: string | null;
  createdBy: { id: string; fullName: string } | null;
}

export interface BillingPackage {
  id: string;
  name: string;
  totalSessions: number;
  usedSessions: number;
  remaining: number;
  unitPrice: number;
  cupsCode: string | null;
  status: string;
  patient: BillingPatientRef;
  createdAt: string;
}

export interface DailyClose {
  date: string;
  income: number;
  expense: number;
  net: number;
  count: number;
  byMethod: Array<{
    method: string;
    methodLabel: string;
    income: number;
    expense: number;
    net: number;
  }>;
}

@Injectable({ providedIn: 'root' })
export class BillingApiService {
  constructor(private readonly http: HttpClient) {}

  listReceipts(from?: string, to?: string) {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.http.get<BillingReceipt[]>(`${API}/billing/receipts${suffix}`);
  }

  createReceipt(body: {
    patientId: string;
    items: Array<{
      description: string;
      quantity?: number;
      unitPrice: number;
      cupsCode?: string;
      packageId?: string;
      appointmentId?: string;
    }>;
    method?: PaymentMethod;
    appointmentId?: string;
    notes?: string;
    tax?: number;
  }) {
    return this.http.post<BillingReceipt>(`${API}/billing/receipts`, body);
  }

  receiptPdfUrl(id: string) {
    return `${API}/billing/receipts/${id}/pdf`;
  }

  listExpenses(from?: string, to?: string) {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const suffix = qs.toString() ? `?${qs}` : '';
    return this.http.get<BillingExpense[]>(`${API}/billing/expenses${suffix}`);
  }

  createExpense(body: {
    category: string;
    amount: number;
    method?: PaymentMethod;
    notes?: string;
    paidAt?: string;
  }) {
    return this.http.post<BillingExpense>(`${API}/billing/expenses`, body);
  }

  listPackages(patientId?: string) {
    const qs = patientId ? `?patientId=${encodeURIComponent(patientId)}` : '';
    return this.http.get<BillingPackage[]>(`${API}/billing/packages${qs}`);
  }

  createPackage(body: {
    patientId: string;
    name: string;
    totalSessions: number;
    unitPrice: number;
    cupsCode?: string;
  }) {
    return this.http.post<BillingPackage>(`${API}/billing/packages`, body);
  }

  dailyClose(date?: string) {
    const qs = date ? `?date=${encodeURIComponent(date)}` : '';
    return this.http.get<DailyClose>(`${API}/billing/daily-close${qs}`);
  }
}
