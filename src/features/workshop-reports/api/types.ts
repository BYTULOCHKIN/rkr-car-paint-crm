import type { CrmAccess, HistoryActor } from '@/features/crm/api/types';
import type { SettlementPayee, SettlementEvent } from '@/features/order-economics/api/types';

export interface ReportFilters {
  from: string;
  to: string;
  orderDate: 'ready' | 'created' | 'delivered';
}
export interface ReportOrder {
  id: string;
  number: number;
  vehicle: string;
  customer: string;
}
export interface EconomicsTotals {
  checkCents: number;
  materialsCents: number;
  employeeAccrualsCents: number;
  subcontractCostsCents: number;
  workshopRemainderCents: number;
}
export interface OrderReportRow extends ReportOrder {
  date: string;
  status: string;
  revision: number | null;
  economics: EconomicsTotals | null;
}
export interface PostingReportRow {
  id: string;
  order: ReportOrder;
  createdAt: string;
  kind: 'initial' | 'correction';
  revision: number;
  delta: EconomicsTotals;
  note: string;
  actor: HistoryActor;
}
export interface MaterialCell {
  quantityMilli: number;
  costCents: number | null;
  unknownMovements: number;
}
export interface MaterialReportRow extends MaterialCell {
  accountingMode?: 'quantity' | 'amount';
  id: string;
  name: string;
  unit: string;
  cells: Record<string, MaterialCell>;
}
export interface SettlementTotals {
  openingCents: number;
  accrualCents: number;
  adjustmentCents: number;
  payoutCents: number;
  returnCents: number;
  /** Balance impact of correcting an erroneous cash record on its own date. */
  reversalCents: number;
  closingCents: number;
  /** Sum per car; advances on other cars are never offset automatically. */
  payableCents: number;
  advanceCents: number;
}
export interface PayeeReportRow extends SettlementTotals {
  payee: SettlementPayee;
}
export interface OrderSettlementRow extends PayeeReportRow {
  order: ReportOrder;
}
export interface SettlementReportEvent {
  id: string;
  order: ReportOrder;
  payee: SettlementPayee;
  kind: SettlementEvent['kind'];
  amountCents: number;
  balanceDeltaCents: number;
  createdAt: string;
  note: string;
  actor: HistoryActor;
}
export interface CashReportRow {
  id: string;
  order: ReportOrder;
  kind: 'payment' | 'reversal' | 'refund' | 'refund_reversal';
  amountCents: number;
  createdAt: string;
  note: string;
}
export interface PeriodReport {
  access: CrmAccess;
  filters: ReportFilters;
  generatedAt: string;
  /** Administrative data is absent from a worker response. */
  economics: EconomicsTotals | null;
  postings: PostingReportRow[];
  orders: OrderReportRow[];
  cash: { netCents: number; rows: CashReportRow[] } | null;
  materials: { orders: ReportOrder[]; rows: MaterialReportRow[] };
  settlements: {
    payees: PayeeReportRow[];
    orders: OrderSettlementRow[];
    events: SettlementReportEvent[];
  };
  undatedRecords: number;
}
