import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { API } from '../api.config';
import { PayrollInput, PayrollParams, PayrollResult } from './payroll-calc';

export type PayStatus = 'LIQUIDADO' | 'PAGADO' | 'PENDIENTE';
export type NoveltyType = 'INGRESO' | 'VACACIONES' | 'INCAPACIDAD' | 'LICENCIA_REM' | 'LICENCIA_NO_REM' | 'RETIRO';
export type SupplyCategory = 'AESTHETIC' | 'CONSUMABLE' | 'MEDICATION';
export type SupplyMovementType = 'IN' | 'OUT' | 'ADJUST';

export interface FinancePayrollSettings extends PayrollParams {
  persisted: boolean;
}

export interface FinancePayrollRun {
  id: string;
  period: string;
  name: string;
  idNumber: string;
  role: string;
  department: string;
  payDate: string | null;
  status: PayStatus;
  input: PayrollInput;
  result: PayrollResult;
  createdAt?: string;
  updatedAt?: string;
}

export interface FinanceNovelty {
  id: string;
  employee: string;
  type: NoveltyType;
  from: string;
  to: string;
  notes: string;
  createdAt?: string;
}

export interface FinanceSupplyItem {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  lotNumber: string | null;
  expiresAt: string | null;
  quantity: number;
  unitCost: number;
  minStock: number;
  notes: string | null;
  category: SupplyCategory;
  stockValue: number;
  lowStock: boolean;
}

export interface FinanceInventorySummary {
  itemCount: number;
  stockValue: number;
  lowStock: number;
  monthEntries: { quantity: number; cost: number };
  monthExits: { quantity: number; cost: number };
}

@Injectable({ providedIn: 'root' })
export class FinanceApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API}/finance`;

  getPayrollSettings() {
    return this.http.get<FinancePayrollSettings>(`${this.base}/payroll/settings`);
  }

  savePayrollSettings(body: PayrollParams) {
    return this.http.put<FinancePayrollSettings>(`${this.base}/payroll/settings`, body);
  }

  listPayrollRuns(period?: string) {
    const q = period ? `?period=${encodeURIComponent(period)}` : '';
    return this.http.get<FinancePayrollRun[]>(`${this.base}/payroll/runs${q}`);
  }

  upsertPayrollRun(body: {
    period: string;
    employeeName: string;
    idNumber: string;
    role?: string;
    department?: string;
    payDate?: string;
    status?: PayStatus;
    input: PayrollInput;
    result: PayrollResult;
  }) {
    return this.http.post<FinancePayrollRun>(`${this.base}/payroll/runs`, body);
  }

  updatePayrollRunStatus(id: string, status: PayStatus) {
    return this.http.patch<FinancePayrollRun>(`${this.base}/payroll/runs/${id}/status`, { status });
  }

  deletePayrollRun(id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/payroll/runs/${id}`);
  }

  listNovelties() {
    return this.http.get<FinanceNovelty[]>(`${this.base}/payroll/novelties`);
  }

  createNovelty(body: Omit<FinanceNovelty, 'id' | 'createdAt'>) {
    return this.http.post<FinanceNovelty>(`${this.base}/payroll/novelties`, body);
  }

  deleteNovelty(id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/payroll/novelties/${id}`);
  }

  listSupplyItems() {
    return this.http.get<FinanceSupplyItem[]>(`${this.base}/inventory/items`);
  }

  inventorySummary(from?: string, to?: string) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const q = params.toString() ? `?${params}` : '';
    return this.http.get<FinanceInventorySummary>(`${this.base}/inventory/summary${q}`);
  }

  createSupplyItem(body: {
    name: string;
    sku?: string;
    unit?: string;
    lotNumber?: string;
    expiresAt?: string | null;
    category?: SupplyCategory;
    unitCost?: number;
    minStock?: number;
    notes?: string;
    initialQuantity?: number;
  }) {
    return this.http.post<FinanceSupplyItem>(`${this.base}/inventory/items`, body);
  }

  updateSupplyItem(id: string, body: {
    name: string;
    sku?: string;
    unit?: string;
    lotNumber?: string;
    expiresAt?: string | null;
    category?: SupplyCategory;
    unitCost?: number;
    minStock?: number;
    notes?: string;
  }) {
    return this.http.put<FinanceSupplyItem>(`${this.base}/inventory/items/${id}`, body);
  }

  deleteSupplyItem(id: string) {
    return this.http.delete<{ ok: boolean }>(`${this.base}/inventory/items/${id}`);
  }

  createSupplyMovement(
    itemId: string,
    body: { type: SupplyMovementType; quantity: number; unitCost?: number; notes?: string; movedAt?: string },
  ) {
    return this.http.post<{ movement: unknown; item: FinanceSupplyItem }>(
      `${this.base}/inventory/items/${itemId}/movements`,
      body,
    );
  }
}
