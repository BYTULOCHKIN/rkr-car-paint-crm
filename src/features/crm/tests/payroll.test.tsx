import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { PayrollView } from '@/features/payroll/components/payroll-view';
import { getPayrollReport } from '@/features/payroll/api/service';
import { buildPayrollReport } from '@/features/payroll/lib/report';
import { payrollFixture } from '@/features/payroll/tests/fixtures';
import { admin, worker } from '@/features/workshop-reports/tests/fixtures';

vi.mock('@/features/payroll/api/service', () => ({ getPayrollReport: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPayrollReport).mockImplementation(async (_org, filters) => {
    const source = payrollFixture();
    return buildPayrollReport(source.workspace, source.team, admin, filters);
  });
});
function view(params = '?payrollFrom=2026-11-01&payrollTo=2026-11-30') {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <NuqsTestingAdapter searchParams={params} hasMemory>
        <PayrollView userId='owner' orgId='org_A' initialToday='2026-11-23' />
      </NuqsTestingAdapter>
    </QueryClientProvider>
  );
}

test('payroll shows earnings, active zero earners and car calculations without payout columns or actions', async () => {
  view();
  const table = await screen.findByRole('table', { name: 'Зарплати команди' });
  expect(within(table).getByText('Артем')).toBeDefined();
  expect(within(table).getByText('Сергій')).toBeDefined();
  expect(table.textContent).not.toMatch(/Виплачено|До виплати|Аванс/);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Зарплата: Сергій' }));
  const dialog = screen.getByRole('dialog', { name: 'Зарплата — Сергій' });
  expect(within(dialog).getByRole('table', { name: 'Нарахування: Сергій' }).textContent).toContain(
    '60%'
  );
  expect(dialog.textContent).toContain('№1');
  expect(dialog.textContent).not.toContain('Валик');
  expect(within(dialog).queryByRole('button', { name: /виплат/i })).toBeNull();
});

test('arbitrary dates update the query; next-month corrections remain separate from initial earnings', async () => {
  view();
  await screen.findByRole('table', { name: 'Зарплати команди' });
  fireEvent.change(screen.getByLabelText('Початок періоду *'), { target: { value: '2026-12-01' } });
  fireEvent.change(screen.getByLabelText('Кінець періоду *'), { target: { value: '2026-12-31' } });
  fireEvent.click(screen.getByRole('button', { name: 'Показати зарплати' }));
  await waitFor(() =>
    expect(getPayrollReport).toHaveBeenLastCalledWith('org_A', {
      from: '2026-12-01',
      to: '2026-12-31'
    })
  );
  expect((await screen.findByRole('table', { name: 'Зарплати команди' })).textContent).toContain(
    '-600,00'
  );
});

test('search filters workers and an invalid bookmarked range never queries the service', async () => {
  const rendered = view();
  await screen.findByRole('table', { name: 'Зарплати команди' });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Пошук працівника' }), {
    target: { value: 'полірувальник' }
  });
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Зарплата: Сергій' })).toBeNull()
  );
  expect(screen.getByRole('button', { name: 'Зарплата: Валик' })).toBeDefined();
  rendered.unmount();
  vi.mocked(getPayrollReport).mockClear();
  view('?payrollFrom=2026-12-01&payrollTo=2026-11-01');
  expect(screen.getByRole('alert').textContent).toContain('Кінець періоду');
  expect(getPayrollReport).not.toHaveBeenCalled();
});

test('workers see only their own payroll even with another person in URL state', async () => {
  vi.mocked(getPayrollReport).mockImplementation(async (_org, filters) => {
    const source = payrollFixture();
    return buildPayrollReport(source.workspace, source.team, worker, filters);
  });
  view('?payrollFrom=2026-11-01&payrollTo=2026-11-30&payrollSearch=Валик');
  await screen.findByRole('table', { name: 'Зарплати команди' });
  expect(screen.getByText('Показано тільки ваші нарахування.')).toBeDefined();
  expect(screen.getByRole('button', { name: 'Зарплата: Сергій' })).toBeDefined();
  expect(screen.queryByRole('searchbox')).toBeNull();
  expect(screen.queryByText('Валик')).toBeNull();
});
