import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { ReportView } from '@/features/workshop-reports/components/report-view';
import { getPeriodReport } from '@/features/workshop-reports/api/service';
import { buildPeriodReport } from '@/features/workshop-reports/lib/report';
import { reportFixture, admin, worker } from '@/features/workshop-reports/tests/fixtures';

vi.mock('@/features/workshop-reports/api/service', () => ({ getPeriodReport: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPeriodReport).mockImplementation(async (_org, filters) => {
    const source = reportFixture();
    return buildPeriodReport(source.workspace, source.movements, admin, filters);
  });
});
function view(params = '?reportFrom=2026-11-01&reportTo=2026-11-30', workerView = false) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <NuqsTestingAdapter searchParams={params} hasMemory>
        <ReportView
          userId='owner'
          orgId='org_A'
          initialToday='2026-11-22'
          workerView={workerView}
        />
      </NuqsTestingAdapter>
    </QueryClientProvider>
  );
}
test('period form updates URL state and fetches the selected inclusive dates', async () => {
  view();
  expect(await screen.findByRole('region', { name: 'Підсумок проведень за період' })).toBeDefined();
  fireEvent.change(screen.getByLabelText('Кінець періоду *'), { target: { value: '2026-12-02' } });
  fireEvent.click(screen.getByRole('button', { name: 'Показати зведення' }));
  await waitFor(() =>
    expect(getPeriodReport).toHaveBeenLastCalledWith('org_A', {
      from: '2026-11-01',
      to: '2026-12-02',
      orderDate: 'ready'
    })
  );
});
test('invalid bookmarked date range displays an error without querying the report', () => {
  view('?reportFrom=2026-12-01&reportTo=2026-11-30');
  expect(screen.getByRole('alert').textContent).toContain('Кінець періоду');
  expect(getPeriodReport).not.toHaveBeenCalled();
});
test('worker report has own balances and no administrative tabs, even with an administrative tab in URL', async () => {
  vi.mocked(getPeriodReport).mockImplementation(async (_org, filters) => {
    const source = reportFixture();
    return buildPeriodReport(source.workspace, source.movements, worker, filters);
  });
  view('?reportFrom=2026-11-01&reportTo=2026-11-30&reportTab=materials', true);
  expect(await screen.findByRole('table', { name: 'Підсумок по одержувачах' })).toBeDefined();
  expect(screen.queryAllByRole('tab')).toHaveLength(0);
  expect(screen.queryByText('Полірувальник')).toBeNull();
  expect(screen.getByText(/Показано тільки ваші розрахунки/)).toBeDefined();
  expect(screen.queryByRole('region', { name: 'Підсумок проведень за період' })).toBeNull();
});
