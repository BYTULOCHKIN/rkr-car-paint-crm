import { queryOptions } from '@tanstack/react-query';
import { getOverview } from './service';

export const overviewQueries = {
  report: (userId: string, orgId: string, today: string) =>
    queryOptions({
      queryKey: ['crm', userId, orgId, 'overview', today] as const,
      queryFn: () => getOverview(orgId, today),
      refetchInterval: 60_000
    })
};
