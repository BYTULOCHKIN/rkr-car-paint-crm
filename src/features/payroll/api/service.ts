'use server';

import { getOrganizationContext } from '@/features/crm/server/organization';
import { CrmError } from '@/features/crm/server/repository';
import { payrollFiltersSchema } from '../schemas/filters';
import { buildPayrollReport } from '../lib/report';
import type { PayrollFilters, PayrollReport } from './types';

export async function getPayrollReport(
  orgId: string,
  filters: PayrollFilters
): Promise<PayrollReport> {
  const { repository, access, team } = await getOrganizationContext();
  if (access.orgId !== orgId) throw new CrmError('Автомалярку змінено. Оновіть сторінку.');
  const value = payrollFiltersSchema.parse(filters);
  const source = repository.reportSnapshot();
  return buildPayrollReport(source.workspace, team, access, value);
}
