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
