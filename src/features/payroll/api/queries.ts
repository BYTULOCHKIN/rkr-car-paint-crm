import { queryOptions } from '@tanstack/react-query';
import { getPayrollReport } from './service';
import type { PayrollFilters } from './types';

export const payrollQueries = {
  period: (userId: string, orgId: string, filters: PayrollFilters) =>
    queryOptions({
      queryKey: ['crm', userId, orgId, 'payroll', filters] as const,
      queryFn: () => getPayrollReport(orgId, filters),
      staleTime: 0,
      refetchInterval: 30_000
    })
};
