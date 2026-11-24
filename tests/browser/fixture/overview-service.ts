import { getWorkspace } from './service';
import { overviewMetrics } from '@/features/overview/lib/metrics';
import { overviewTrends } from '@/features/overview/lib/trends';

export async function getOverview(_orgId: string, today: string) {
  const data = await getWorkspace();
  const metrics = overviewMetrics(data, today);
  return {
    data: { ...data, serverRead: true },
    metrics,
    queueCounts: { attention: metrics.attention.length, schedule: metrics.schedule.length },
    trends: overviewTrends(data, today, metrics),
    empty:
      !data.customers.length &&
      !data.vehicles.length &&
      !data.orders.length &&
      !data.requests.length
  };
}
