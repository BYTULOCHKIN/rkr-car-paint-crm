import { queryOptions } from '@tanstack/react-query';
import { getPeriodReport } from './service';
import type { ReportFilters } from './types';

export const reportQueries = {
  period: (userId: string, orgId: string, filters: ReportFilters) =>
    queryOptions({
      // Existing CRM and inventory mutations invalidate this prefix as well.
      queryKey: ['crm', userId, orgId, 'reports', filters] as const,
      queryFn: () => getPeriodReport(orgId, filters),
      staleTime: 0,
      refetchInterval: 30_000
    })
};
