import type { OverviewPeriod } from '../schemas/period';
import { currentOverviewMonth } from '../lib/period';
import { queryOptions } from '@tanstack/react-query';
import { getOverview } from './service';

export const overviewQueries = {
  report: (
    userId: string,
    orgId: string,
    today: string,
    period: OverviewPeriod = currentOverviewMonth(today)
  ) =>
    queryOptions({
      queryKey: ['crm', userId, orgId, 'overview', today, period] as const,
      queryFn: () => getOverview(orgId, today, period),
      refetchInterval: 60_000
    })
};
