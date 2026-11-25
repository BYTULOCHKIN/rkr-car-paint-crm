import type { CrmWorkspace } from '@/features/crm/api/types';
import { overviewMetrics } from './metrics';
import { overviewFacts, overviewPeriodTotals } from './cohorts';
import { comparisonPeriod, inPeriod, periodDayCount, shiftDay } from './period';
import {
  compareMetric,
  overviewTrends,
  type MetricTrend,
  type OverviewTrends,
  type TrendKey
} from './trends';
import type { ActivityMonth } from './metrics';
import type { OverviewPeriod } from '../schemas/period';

export type PeriodTrendKey = TrendKey | 'profitCents';
export interface PeriodTrends extends Omit<OverviewTrends, 'metrics'> {
  metrics: Record<PeriodTrendKey, MetricTrend>;
}
export function overviewPeriodMetrics(data: CrmWorkspace, today: string, period: OverviewPeriod) {
  const base = overviewMetrics(data, today);
  const facts = overviewFacts(data);
  const days = periodDayCount(period);
  const granularity = days <= 62 ? 'day' : days <= 1096 ? 'month' : 'year';
  const key = (day: string) =>
    day.slice(0, granularity === 'day' ? 10 : granularity === 'month' ? 7 : 4);
  const activity = new Map<string, ActivityMonth>();
  let date = period.from;
  while (date <= period.to) {
    const bucket = key(date);
    activity.set(bucket, {
      month: bucket,
      label:
        granularity === 'day'
          ? `${date.slice(8)}.${date.slice(5, 7)}`
          : granularity === 'month'
            ? `${date.slice(5, 7)}.${date.slice(0, 4)}`
            : date.slice(0, 4),
      requests: 0,
      orders: 0
    });
    if (bucket === key(period.to)) break;
    if (granularity === 'day') date = shiftDay(date, 1);
    else if (granularity === 'month') {
      const next = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      date = next.toISOString().slice(0, 10);
    } else date = `${Number(date.slice(0, 4)) + 1}-01-01`;
  }
  for (const fact of facts.orders)
    if (inPeriod(fact.created, period)) activity.get(key(fact.created!))!.orders++;
  return {
    ...base,
    ...overviewPeriodTotals(facts, period),
    activity: [...activity.values()],
    recentOrders: facts.orders
      .filter((entry) => inPeriod(entry.created, period))
      .map((entry) => entry.order)
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt) || b.number - a.number)
      .slice(0, 5)
  };
}
export type OverviewPeriodMetrics = ReturnType<typeof overviewPeriodMetrics>;

export function overviewPeriodTrends(
  data: CrmWorkspace,
  today: string,
  period: OverviewPeriod,
  current: OverviewPeriodMetrics
): PeriodTrends {
  // Operational cards keep today's status history; period financial cards use current order economics.
  const operational = overviewTrends(data, today);
  const previousPeriod = comparisonPeriod(period, today);
  const facts = overviewFacts(data);
  const previous = overviewPeriodTotals(facts, previousPeriod);
  const step = Math.max(1, Math.ceil(periodDayCount(period) / 60));
  const points: { date: string; totals: ReturnType<typeof overviewPeriodTotals> }[] = [];
  for (let day = period.from; day < period.to; day = shiftDay(day, step))
    points.push({ date: day, totals: overviewPeriodTotals(facts, { from: period.from, to: day }) });
  points.push({ date: period.to, totals: current });
  const financialKeys = [
    'deliveredThisMonth',
    'monthlyReceiptsCents',
    'debtCents',
    'pendingPaymentCents',
    'profitCents'
  ] as const;
  const financial = Object.fromEntries(
    financialKeys.map((key) => [
      key,
      {
        current: current[key],
        previous:
          key === 'profitCents' &&
          (current.unpostedProfitCount > 0 || previous.unpostedProfitCount > 0)
            ? null
            : previous[key],
        ...compareMetric(
          current[key],
          key === 'profitCents' &&
            (current.unpostedProfitCount > 0 || previous.unpostedProfitCount > 0)
            ? null
            : previous[key]
        ),
        points: points.map((point) => ({ date: point.date, value: point.totals[key] }))
      }
    ])
  ) as Record<(typeof financialKeys)[number], MetricTrend>;
  return {
    start: period.from,
    end: period.to,
    previousStart: previousPeriod.from,
    previousEnd: previousPeriod.to,
    metrics: { ...operational.metrics, ...financial }
  };
}
