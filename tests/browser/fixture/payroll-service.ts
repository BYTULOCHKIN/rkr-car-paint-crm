import { buildPayrollReport } from '@/features/payroll/lib/report';
import { payrollFixture } from '@/features/payroll/tests/fixtures';
import { admin, worker } from '@/features/workshop-reports/tests/fixtures';
import type { PayrollFilters } from '@/features/payroll/api/types';
import { financeFixtureData, getWorkspace } from './service';

export async function getPayrollReport(_orgId: string, filters: PayrollFilters) {
  if (new URLSearchParams(location.search).has('flowDemo')) {
    const workspace = await getWorkspace();
    return buildPayrollReport(
      financeFixtureData(),
      workspace.team ?? [],
      workspace.access!,
      filters
    );
  }
  const source = payrollFixture();
  const access = new URLSearchParams(location.search).get('role') === 'worker' ? worker : admin;
  return buildPayrollReport(source.workspace, source.team, access, filters);
}
