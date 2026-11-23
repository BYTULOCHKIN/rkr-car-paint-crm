import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

test('settlements show a compact summary, scoped search and individual car history instead of three full tables', async () => {
  view('?reportFrom=2026-11-01&reportTo=2026-11-30&reportTab=settlements');
  const table = await screen.findByRole('table', { name: 'Підсумок по одержувачах' });
  expect(within(table).getAllByRole('columnheader')).toHaveLength(5);
  expect(screen.queryByRole('table', { name: 'Баланси по авто' })).toBeNull();
  expect(screen.queryByLabelText('Відбір на вкладці «Авто»')).toBeNull();
  expect(screen.getByRole('region', { name: 'Підсумок розрахунків' }).textContent).toContain(
    '3\u00a0000,00'
  );
  const user = userEvent.setup();
  await user.click(within(table).getByRole('button', { name: 'Деталі розрахунків: Маляр' }));
  const dialog = screen.getByRole('dialog', { name: 'Розрахунки — Маляр' });
  expect(within(dialog).getByRole('table', { name: 'Баланси по авто' })).toBeDefined();
  await user.click(within(dialog).getByRole('tab', { name: 'Історія операцій' }));
  expect(within(dialog).getByRole('table', { name: 'Операції розрахунків' }).textContent).toContain(
    'Виплата / аванс'
  );
  await user.click(within(dialog).getByRole('button', { name: 'Закрити' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Пошук одержувача' }), {
    target: { value: 'Полірувальник' }
  });
  await waitFor(() =>
    expect(
      screen.getByRole('table', { name: 'Підсумок по одержувачах' }).textContent
    ).not.toContain('Маляр')
  );
  expect(screen.getByRole('table', { name: 'Підсумок по одержувачах' }).textContent).toContain(
    'Полірувальник'
  );
});
