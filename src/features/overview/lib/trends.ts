import type { CrmWorkspace, RepairOrder, WorkflowEvent } from '@/features/crm/api/types';
import { businessToday } from '@/features/crm/lib/workflow';
import { overviewMetrics, type OverviewMetrics } from './metrics';

export type TrendKey =
  | 'activeRequests'
  | 'inProgress'
  | 'ready'
  | 'deliveredThisMonth'
  | 'monthlyReceiptsCents'
  | 'debtCents'
  | 'pendingPaymentCents';
export interface TrendPoint {
  date: string;
  value: number | null;
}
export interface MetricTrend {
  points: TrendPoint[];
  current: number;
  previous: number | null;
  percentage: number | null;
  comparison: 'percent' | 'new' | 'unknown';
}
export interface OverviewTrends {
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  metrics: Record<TrendKey, MetricTrend>;
}
const keys: TrendKey[] = [
  'activeRequests',
  'inProgress',
  'ready',
  'deliveredThisMonth',
  'monthlyReceiptsCents',
  'debtCents',
  'pendingPaymentCents'
];

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function monthComparison(today: string) {
  const [year, month, day] = today.split('-').map(Number);
  const previousLast = new Date(Date.UTC(year, month - 1, 0, 12));
  const previousStart = dateString(
    new Date(Date.UTC(previousLast.getUTCFullYear(), previousLast.getUTCMonth(), 1, 12))
  );
  const previousEnd = dateString(
    new Date(
      Date.UTC(
        previousLast.getUTCFullYear(),
        previousLast.getUTCMonth(),
        Math.min(day, previousLast.getUTCDate()),
        12
      )
    )
  );
  return { start: `${today.slice(0, 7)}-01`, end: today, previousStart, previousEnd };
}

export function compareMetric(
  current: number,
  previous: number | null
): Pick<MetricTrend, 'percentage' | 'comparison'> {
  if (previous === null) return { percentage: null, comparison: 'unknown' };
  if (previous === 0 && current !== 0) return { percentage: null, comparison: 'new' };
  return {
    percentage: previous === 0 ? 0 : ((current - previous) / previous) * 100,
    comparison: 'percent'
  };
}

/** Calendar-day snapshots reconstructed from status, content and factual-date history. */
export function overviewTrends(
  data: CrmWorkspace,
  today: string,
  current: OverviewMetrics = overviewMetrics(data, today)
): OverviewTrends {
  const calendarDays = new Map<string, string>();
  const dayOf = (timestamp: string): string => {
    let day = calendarDays.get(timestamp);
    if (!day) {
      day = businessToday(new Date(timestamp));
      calendarDays.set(timestamp, day);
    }
    return day;
  };
  const period = monthComparison(today);
  const histories = new Map<string, WorkflowEvent[]>();
  // Workspace events are newest-first, including ties within the same millisecond.
  const ordered = data.events
    .map((event, index) => ({ event, index }))
    .toSorted((a, b) => a.event.createdAt.localeCompare(b.event.createdAt) || b.index - a.index);
  for (const { event } of ordered) {
    const key = `${event.kind}:${event.recordId}`;
    const list = histories.get(key) ?? [];
    list.push(event);
    histories.set(key, list);
  }
  const cancelled = new Set(
    (data.payments ?? [])
      .filter((entry) => entry.kind === 'reversal' && dayOf(entry.createdAt) <= today)
      .map((entry) => entry.reversalOf)
  );
  const payments = (data.payments ?? [])
    .filter(
      (entry) =>
        entry.kind === 'payment' && !cancelled.has(entry.id) && dayOf(entry.createdAt) <= today
    )
    .map((entry) => ({ ...entry, day: dayOf(entry.createdAt) }));
  const requestDates = new Map(
    data.requests.map((request) => [request.id, dayOf(request.createdAt)])
  );
  const orderDates = new Map(data.orders.map((order) => [order.id, dayOf(order.createdAt)]));
  const conversions = new Map(
    data.orders
      .filter((order) => order.requestId)
      .map((order) => [order.requestId!, orderDates.get(order.id)!])
  );

  function snapshot(day: string): Record<TrendKey, number | null> {
    let activeRequests: number | null = 0;
    let inProgress: number | null = 0;
    let ready: number | null = 0;
    let deliveredThisMonth: number | null = 0;
    let debtCents: number | null = 0;
    let pendingPaymentCents: number | null = 0;
    const month = day.slice(0, 7);
    const paid = new Map<string, number>();
    let monthlyReceiptsCents = 0;
    for (const payment of payments) {
      if (payment.day > day) continue;
      paid.set(payment.orderId, (paid.get(payment.orderId) ?? 0) + payment.amountCents);
      if (payment.day.startsWith(month)) monthlyReceiptsCents += payment.amountCents;
    }
    for (const request of data.requests) {
      if (requestDates.get(request.id)! > day) continue;
      const events = histories.get(`request:${request.id}`) ?? [];
      const last = events.findLast((event) => dayOf(event.createdAt) <= day);
      const future = events.find((event) => dayOf(event.createdAt) > day);
      const conversion = conversions.get(request.id);
      const status =
        last?.toStatus ??
        future?.fromStatus ??
        (conversion
          ? conversion <= day
            ? 'converted'
            : 'backlog'
          : request.status === 'converted'
            ? null
            : request.status);
      if (!status) activeRequests = null;
      else if (
        status !== 'converted' &&
        (!conversion || conversion > day) &&
        activeRequests !== null
      )
        activeRequests++;
    }
    for (const order of data.orders) {
      if (orderDates.get(order.id)! > day) continue;
      const events = histories.get(`order:${order.id}`) ?? [];
      const last = events.findLast((event) => dayOf(event.createdAt) <= day);
      const future = events.filter((event) => dayOf(event.createdAt) > day);
      const facts = {
        actualIntakeDate: order.actualIntakeDate,
        actualReadyDate: order.actualReadyDate,
        actualDeliveryDate: order.actualDeliveryDate
      };
      let total = order.totalCents;
      for (const event of future.toReversed()) {
        if (event.orderChanges) total = event.orderChanges.before.totalCents;
        for (const change of event.actualDateChanges ?? []) facts[change.field] = change.before;
      }
      const status = last?.toStatus ?? future[0]?.fromStatus ?? fallbackStatus(order, facts, day);
      if (!status) {
        inProgress = null;
        ready = null;
        debtCents = null;
        pendingPaymentCents = null;
        if (!facts.actualDeliveryDate) deliveredThisMonth = null;
        continue;
      }
      if (status === 'in_progress' && inProgress !== null) inProgress++;
      if (status === 'ready' && ready !== null) ready++;
      const remaining = Math.max(0, total - (paid.get(order.id) ?? 0));
      if (status === 'delivered') {
        if (debtCents !== null) debtCents += remaining;
        if (
          facts.actualDeliveryDate?.startsWith(month) &&
          facts.actualDeliveryDate <= day &&
          deliveredThisMonth !== null
        )
          deliveredThisMonth++;
      } else if (pendingPaymentCents !== null) pendingPaymentCents += remaining;
    }
    return {
      activeRequests,
      inProgress,
      ready,
      deliveredThisMonth,
      monthlyReceiptsCents,
      debtCents,
      pendingPaymentCents
    };
  }
  const previous = snapshot(period.previousEnd);
  const daily: { date: string; values: Record<TrendKey, number | null> }[] = [];
  for (let day = 1; day <= Number(today.slice(-2)); day++) {
    const date = `${today.slice(0, 7)}-${String(day).padStart(2, '0')}`;
    daily.push({ date, values: date === today ? current : snapshot(date) });
  }
  return {
    ...period,
    metrics: Object.fromEntries(
      keys.map((key) => [
        key,
        {
          points: daily.map(({ date, values }) => ({ date, value: values[key] })),
          current: current[key],
          previous: previous[key],
          ...compareMetric(current[key], previous[key])
        }
      ])
    ) as Record<TrendKey, MetricTrend>
  };
}

function fallbackStatus(
  order: RepairOrder,
  facts: Pick<RepairOrder, 'actualIntakeDate' | 'actualReadyDate' | 'actualDeliveryDate'>,
  day: string
): RepairOrder['status'] | null {
  if (facts.actualDeliveryDate && facts.actualDeliveryDate <= day) return 'delivered';
  if (facts.actualReadyDate && facts.actualReadyDate <= day) return 'ready';
  // Legacy orders missing their completion facts cannot be dated reliably.
  if (order.status === 'delivered' && !facts.actualDeliveryDate) return null;
  if (order.status === 'ready' && !facts.actualReadyDate) return null;
  if (facts.actualIntakeDate && facts.actualIntakeDate <= day) return 'in_progress';
  return order.status === 'created' ? 'created' : null;
}
