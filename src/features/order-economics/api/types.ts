/** Money is UAH kopecks unless a field explicitly refers to the purchase currency. */
export interface SubcontractCost {
  kind: 'color_matching' | 'soldering' | 'other';
  priceCents: number;
  costCents: number;
}

/** Whole-car totals by role. Allocation between people is a separate concern. */
export interface OrderEconomicsInput {
  paintingPriceCents: number;
  polishingPriceCents: number;
  assemblyPriceCents: number;
  paintingMaterialsCents: number;
  polishingMaterialsCents: number;
  employeeShareBps: number;
  subcontracts: readonly SubcontractCost[];
}

export interface OrderEconomicsResult {
  checkCents: number;
  materialsCents: number;
  painterBaseCents: number;
  polisherBaseCents: number;
  assemblerBaseCents: number;
  painterAccrualCents: number;
  polisherAccrualCents: number;
  assemblerAccrualCents: number;
  employeeAccrualsCents: number;
  subcontractCostsCents: number;
  workshopRemainderCents: number;
}

export interface EconomicsAdjustmentPreview {
  before: OrderEconomicsResult;
  after: OrderEconomicsResult;
  delta: OrderEconomicsResult;
}

export interface StockValuation {
  quantityMilli: number;
  totalCostCents: number;
}

export interface ValuedConsumption {
  quantityMilli: number;
  costCents: number;
  balance: StockValuation;
}

export interface PurchaseValuationInput {
  currency: 'UAH' | 'EUR';
  /** Total purchase amount in the original currency's minor units, not a unit price. */
  amountMinor: number;
  /** UAH per one currency unit, scaled by 1,000,000; UAH requires 1,000,000. */
  exchangeRateMicros: number;
}

export interface WorkerSettlementEntry {
  kind: 'accrual' | 'adjustment' | 'payout' | 'return';
  /** Only adjustments may be negative. Returns refer to actual money returned. */
  amountCents: number;
}

export interface WorkerSettlementBalance {
  accruedCents: number;
  paidCents: number;
  balanceCents: number;
  payableCents: number;
  advanceCents: number;
}

export type WorkKind = 'painting' | 'assembly' | 'color_matching' | 'soldering' | 'other';

export interface DetailedWorkLine {
  id: string;
  kind: WorkKind;
  description: string;
  quantity: number;
  unitPriceCents: number;
  /** Total internal portion for the entire line, already included in its client price. */
  polishingCents: number;
  subcontractCostCents: number;
  contractorName: string;
  contractorId?: string;
}

export interface OrderEconomicsDetails {
  employeeShareBps: number;
  painterId: string;
  polisherId: string;
  assemblerId: string;
  painterName?: string;
  polisherName?: string;
  assemblerName?: string;
  lines: DetailedWorkLine[];
}

export interface SettlementPayee {
  kind: 'worker' | 'contractor';
  id: string;
  name: string;
}
export interface PayeeAccrual {
  payee: SettlementPayee;
  amountCents: number;
}
export interface EconomicsPosting {
  model?: 'order_net';
  expenses?: import('@/features/order-expenses/api/types').OrderExpense[];
  id: string;
  operationId: string;
  orderId: string;
  revision: number;
  kind: 'initial' | 'correction';
  details: OrderEconomicsDetails;
  costs: {
    paintingCents: number;
    polishingCents: number;
    unallocatedCents: number;
    totalCents: number;
  };
  result: OrderEconomicsResult;
  allocations: PayeeAccrual[];
  note: string;
  actor: { id: string; name: string };
  createdAt: string;
}
export interface SettlementEvent {
  id: string;
  orderId: string;
  payee: SettlementPayee;
  kind: 'accrual' | 'adjustment' | 'payout' | 'return' | 'reversal';
  amountCents: number;
  postingId: string | null;
  reversalOf: string | null;
  note: string;
  actor: { id: string; name: string };
  createdAt: string;
}
export interface FinanceWorkspace {
  postings: EconomicsPosting[];
  events: SettlementEvent[];
  inventoryRevision: string;
  defaultShareBps: number;
  settingsRevision: number;
}
export interface CorrectionPreview {
  before: EconomicsPosting | null;
  after: {
    details: OrderEconomicsDetails;
    costs: EconomicsPosting['costs'];
    result: OrderEconomicsResult;
    allocations: PayeeAccrual[];
  };
  deltas: PayeeAccrual[];
}
