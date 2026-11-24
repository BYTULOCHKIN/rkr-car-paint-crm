'use server';

import { getOrganizationContext } from '@/features/crm/server/organization';
import { CrmError } from '@/features/crm/server/repository';
import { reportFiltersSchema } from '../schemas/filters';
import { buildPeriodReport } from '../lib/report';
import type { PeriodReport, ReportFilters } from './types';

export async function getPeriodReport(
  orgId: string,
  filters: ReportFilters
): Promise<PeriodReport> {
  const { repository, access } = await getOrganizationContext();
  if (access.orgId !== orgId) throw new CrmError('Автомалярку змінено. Оновіть сторінку.');
  const value = reportFiltersSchema.parse(filters);
  const source = repository.reportSnapshot(value);
  return buildPeriodReport(source.workspace, source.movements, access, value);
}
