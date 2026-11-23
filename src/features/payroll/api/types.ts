import type { CrmAccess, WorkerSpecialty } from '@/features/crm/api/types';

export interface PayrollFilters {
  from: string;
  to: string;
}

export type PayrollRole = 'painter' | 'polisher' | 'assembler';

export interface PayrollCalculation {
  baseCents: number;
  shareBps: number;
  amountCents: number;
}

export interface PayrollOrder {
  id: string;
  number: number;
  vehicle: string;
}

export interface PayrollEntry {
  id: string;
  workerId: string;
  order: PayrollOrder;
  role: PayrollRole;
  kind: 'initial' | 'correction';
  createdAt: string;
  before: PayrollCalculation | null;
  after: PayrollCalculation | null;
  amountCents: number;
  note: string;
}

export interface PayrollTotals {
  accrualCents: number;
  adjustmentCents: number;
  totalCents: number;
  orderCount: number;
}

export interface PayrollWorker extends PayrollTotals {
  id: string;
  name: string;
  imageUrl?: string;
  specialties: WorkerSpecialty[];
  active: boolean;
  entries: PayrollEntry[];
}

/** Accruals only: cash journals and balances are never returned by this service. */
export interface PayrollReport {
  access: CrmAccess;
  filters: PayrollFilters;
  generatedAt: string;
  totals: PayrollTotals;
  workers: PayrollWorker[];
  warnings: {
    undatedPostings: number;
    unpostedOrders: PayrollOrder[];
    coloristSubcontractCents: number;
  };
}
