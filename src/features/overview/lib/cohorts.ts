import type { CrmWorkspace, PaymentEvent, RepairOrder } from '@/features/crm/api/types';
import { paymentDelta } from '@/features/crm/lib/payment-balance';
import { isCompletedStatus } from '@/features/crm/lib/workflow';
import { sumIntegers } from '@/features/order-economics/lib/integers';
import { inPeriod, timestampDay } from './period';
import type { OverviewOrderMetric, OverviewPeriod } from '../schemas/period';

export interface OverviewOrderFact {
  order: RepairOrder;
  created: string | null;
  ready: string | null;
  remaining: number;
  profit: number | undefined;
}
export interface OverviewFacts {
  orders: OverviewOrderFact[];
  receipts: { orderId: string; day: string; amount: number }[];
}
export function overviewFacts(data: CrmWorkspace): OverviewFacts {
  const orders = data.orders.filter((order) => !order.deletedAt);
  const ids = new Set(orders.map((order) => order.id));
  const payments = (data.payments ?? []).filter((entry) => ids.has(entry.orderId));
  const cancelled = new Set(
    payments
      .filter((entry) => entry.kind === 'reversal' || entry.kind === 'refund_reversal')
      .map((entry) => entry.reversalOf)
  );
  const paid = new Map<string, number>();
  for (const entry of payments)
    paid.set(entry.orderId, sumIntegers([paid.get(entry.orderId) ?? 0, paymentDelta(entry)]));
  const profits = new Map(Object.entries(data.orderProfits ?? {}));
  if (!data.orderProfits) {
    const postings = new Map<string, NonNullable<CrmWorkspace['finance']>['postings'][number]>();
    for (const posting of data.finance?.postings ?? [])
      if (
        !postings.has(posting.orderId) ||
        postings.get(posting.orderId)!.revision < posting.revision
      )
        postings.set(posting.orderId, posting);
    for (const posting of postings.values())
      profits.set(posting.orderId, posting.result.workshopRemainderCents);
  }
  const valid = (entry: PaymentEvent) =>
    (entry.kind === 'payment' || entry.kind === 'refund') && !cancelled.has(entry.id);
  return {
    orders: orders.map((order) => ({
      order,
      created: timestampDay(order.createdAt),
      ready: isCompletedStatus(order.status)
        ? (order.actualReadyDate ?? order.actualDeliveryDate)
        : null,
      remaining: Math.max(0, order.totalCents - (paid.get(order.id) ?? 0)),
      profit: profits.get(order.id)
    })),
    receipts: payments.filter(valid).flatMap((entry) => {
      const day = timestampDay(entry.createdAt);
      return day ? [{ orderId: entry.orderId, day, amount: paymentDelta(entry) }] : [];
    })
  };
}
export function matchesOverviewOrder(
  fact: OverviewOrderFact,
  facts: OverviewFacts,
  metric: OverviewOrderMetric,
  period: OverviewPeriod
): boolean {
  switch (metric) {
    case 'created_period':
      return inPeriod(fact.created, period);
    case 'completed':
      return inPeriod(fact.ready, period);
    case 'profit':
      return inPeriod(fact.ready, period) && fact.profit !== undefined;
    case 'unposted':
      return inPeriod(fact.ready, period) && fact.profit === undefined;
    case 'ready_debt':
      return inPeriod(fact.ready, period) && fact.remaining > 0;
    case 'open_debt':
      return (
        !isCompletedStatus(fact.order.status) &&
        inPeriod(fact.created, period) &&
        fact.remaining > 0
      );
    case 'receipts':
      return facts.receipts.some(
        (entry) => entry.orderId === fact.order.id && inPeriod(entry.day, period)
      );
  }
}
export function overviewPeriodTotals(facts: OverviewFacts, period: OverviewPeriod) {
  const completed = facts.orders.filter((entry) => inPeriod(entry.ready, period));
  const debts = completed.filter((entry) => entry.remaining > 0);
  return {
    deliveredThisMonth: completed.length,
    deliveredValueCents: sumIntegers(completed.map((entry) => entry.order.totalCents)),
    monthlyReceiptsCents: sumIntegers(
      facts.receipts.filter((entry) => inPeriod(entry.day, period)).map((entry) => entry.amount)
    ),
    debtCents: sumIntegers(debts.map((entry) => entry.remaining)),
    debtOrderCount: debts.length,
    pendingPaymentCents: sumIntegers(
      facts.orders
        .filter(
          (entry) => !isCompletedStatus(entry.order.status) && inPeriod(entry.created, period)
        )
        .map((entry) => entry.remaining)
    ),
    profitCents: sumIntegers(
      completed.flatMap((entry) => (entry.profit === undefined ? [] : [entry.profit]))
    ),
    unpostedProfitCount: completed.filter((entry) => entry.profit === undefined).length
  };
}
