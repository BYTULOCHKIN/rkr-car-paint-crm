import { getWorkspace } from './service';
import {
  overviewPeriodMetrics,
  overviewPeriodTrends
} from '@/features/overview/lib/period-metrics';
import { currentOverviewMonth } from '@/features/overview/lib/period';
import type { OverviewPeriod } from '@/features/overview/schemas/period';

export async function getOverview(
  _orgId: string,
  today: string,
  period: OverviewPeriod = currentOverviewMonth(today)
) {
  const data = await getWorkspace();
  const metrics = overviewPeriodMetrics(data, today, period);
  return {
    data: { ...data, serverRead: true },
    period,
    metrics,
    queueCounts: { attention: metrics.attention.length, schedule: metrics.schedule.length },
    trends: overviewPeriodTrends(data, today, period, metrics),
    empty:
      !data.customers.length &&
      !data.vehicles.length &&
      !data.orders.length &&
      !data.requests.length
  };
}
