import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DeleteStockItem } from '@/features/inventory/components/delete-stock-item';
import { deleteStockItem } from '@/features/inventory/api/service';
import type { StockItem } from '@/features/inventory/api/types';

vi.mock('../api/service', () => ({}));
vi.mock('../api/read-service', () => ({}));
vi.mock('@/features/inventory/api/service', () => ({ deleteStockItem: vi.fn() }));
const item: StockItem = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Фарба',
  unit: '',
  accountingMode: 'amount',
  tags: ['Фарба'],
  notes: '',
  archived: false,
  locked: false,
  balanceMilli: 0,
  totalCostCents: 0,
  valuationRevision: 0
};
function show(value = item) {
  const onDeleted = vi.fn(),
    onCancel = vi.fn(),
    onPendingChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={client}>
      <DeleteStockItem
        orgId='org_A'
        item={value}
        onDeleted={onDeleted}
        onCancel={onCancel}
        onPendingChange={onPendingChange}
      />
    </QueryClientProvider>
  );
  return { onDeleted, onCancel, onPendingChange };
}
beforeEach(() => vi.clearAllMocks());

test('stock delete confirmation exposes the server error and preserves the selection', async () => {
  vi.mocked(deleteStockItem).mockResolvedValue({
    ok: false,
    error: 'Не можна видалити позицію назавжди: є нова операція.'
  });
  const { onDeleted } = show();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Видалити назавжди' }));
  expect((await screen.findByRole('alert')).textContent).toContain('є нова операція');
  expect(onDeleted).not.toHaveBeenCalled();
  expect(deleteStockItem).toHaveBeenCalledWith('org_A', {
    id: item.id,
    expectedName: item.name,
    expectedArchived: false
  });
  expect(screen.getByText(/Видалити позицію «Фарба»/)).toBeDefined();
});

test('pending permanent deletion locks cancellation and repeat submission', async () => {
  const gate = Promise.withResolvers<Awaited<ReturnType<typeof deleteStockItem>>>();
  vi.mocked(deleteStockItem).mockReturnValue(gate.promise);
  const { onDeleted, onCancel, onPendingChange } = show();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Видалити назавжди' }));
  await waitFor(() => expect(onPendingChange).toHaveBeenCalledWith(true));
  expect((screen.getByRole('button', { name: 'Скасувати' }) as HTMLButtonElement).disabled).toBe(
    true
  );
  await user.click(screen.getByRole('button', { name: 'Скасувати' }));
  await user.click(screen.getByRole('button', { name: 'Видалити назавжди' }));
  expect(onCancel).not.toHaveBeenCalled();
  expect(deleteStockItem).toHaveBeenCalledOnce();
  gate.resolve({ ok: true, data: undefined });
  await waitFor(() => expect(onDeleted).toHaveBeenCalledOnce());
});

test('amount-only materials with zero stock and historical usage cannot be confirmed for deletion', async () => {
  show({ ...item, locked: true });
  expect(screen.getByRole('alert').textContent).toContain('Є історія операцій');
  expect(
    (screen.getByRole('button', { name: 'Видалити назавжди' }) as HTMLButtonElement).disabled
  ).toBe(true);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Видалити назавжди' }));
  expect(deleteStockItem).not.toHaveBeenCalled();
});
