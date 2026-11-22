import { buildPeriodReport } from '@/features/workshop-reports/lib/report';
import { reportFixture, admin, worker } from '@/features/workshop-reports/tests/fixtures';
import type { ReportFilters } from '@/features/workshop-reports/api/types';
import { financeFixtureData, getWorkspace } from './service';
import { getInventory } from './inventory-service';

export async function getPeriodReport(_orgId: string, filters: ReportFilters) {
  if (new URLSearchParams(location.search).has('flowDemo')) {
    const workspace = await getWorkspace();
    return buildPeriodReport(
      financeFixtureData(),
      (await getInventory()).movements,
      workspace.access!,
      filters
    );
  }
  const source = reportFixture();
  const access = new URLSearchParams(location.search).get('role') === 'worker' ? worker : admin;
  return buildPeriodReport(source.workspace, source.movements, access, filters);
}
