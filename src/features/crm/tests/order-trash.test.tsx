vi.mock('@/features/inventory/api/service', () => import('./inventory-stub'));
import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmEditorDialog } from '../components/editor-dialog';
import { changeOrderTrash } from '../api/service';
import type { CrmWorkspace, RepairOrder } from '../api/types';

vi.mock('../api/service', () => ({
  getWorkspace: vi.fn(),
  getOrderTrash: vi.fn(),
  changeOrderTrash: vi.fn()
}));
const order = {
  id: '00000000-0000-4000-8000-000000000001',
  number: 1001,
  status: 'created',
  workflowRevision: 3,
  description: 'Фарбування',
  items: [],
  totalCents: 150000
} as unknown as RepairOrder;
const data: CrmWorkspace = {
  customers: [],
  vehicles: [],
  requests: [],
  orders: [order],
  events: [],
  access: { role: 'admin', orgId: 'org_A', userId: 'admin' }
};
function show(record = order, restore = false, current = data) {
  const close = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
        })
      }
    >
      <CrmEditorDialog
        editor={{ type: restore ? 'restoreOrder' : 'trashOrder', order: record }}
        data={current}
        onClose={close}
        onSelectOrder={vi.fn()}
      />
    </QueryClientProvider>
  );
  return close;
}
beforeEach(() => vi.clearAllMocks());
test('blocked trash explains the operation and cannot submit', async () => {
  const user = userEvent.setup();
  show({ ...order, trashBlockedReason: 'Є оплати клієнта.' });
  expect(screen.getByRole('alert').textContent).toContain('Є оплати клієнта');
  expect(
    (screen.getByRole('button', { name: 'Перемістити в кошик' }) as HTMLButtonElement).disabled
  ).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Перемістити в кошик' }));
  expect(changeOrderTrash).not.toHaveBeenCalled();
});
test('server conflict keeps the confirmation open; pending operations prevent dismissal and submit verified revision', async () => {
  const user = userEvent.setup();
  const close = show();
  let finish: ((value: Awaited<ReturnType<typeof changeOrderTrash>>) => void) | undefined;
  vi.mocked(changeOrderTrash).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await user.click(screen.getByRole('button', { name: 'Перемістити в кошик' }));
  await waitFor(() =>
    expect(changeOrderTrash).toHaveBeenCalledWith({
      orgId: 'org_A',
      orderId: order.id,
      expectedRevision: 3,
      action: 'trash'
    })
  );
  await user.keyboard('{Escape}');
  expect(close).not.toHaveBeenCalled();
  expect(
    (screen.getByRole('button', { name: 'Закрити', exact: true }) as HTMLButtonElement).disabled
  ).toBe(true);
  finish?.({ ok: false, error: 'Замовлення вже змінено' });
  expect(await screen.findByText('Замовлення вже змінено')).toBeDefined();
  expect(close).not.toHaveBeenCalled();
});
test('restore uses a dedicated action and closes only after success', async () => {
  const user = userEvent.setup();
  vi.mocked(changeOrderTrash).mockResolvedValue({ ok: true, data: null });
  const close = show({ ...order, deletedAt: '2026-11-23T12:00:00Z' }, true);
  await user.click(screen.getByRole('button', { name: 'Відновити замовлення', exact: true }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(changeOrderTrash).toHaveBeenCalledWith(
    expect.objectContaining({ action: 'restore', expectedRevision: 3 })
  );
});
test('worker cannot use a trash editor even when explicitly opened', () => {
  show(order, false, { ...data, access: { ...data.access!, role: 'worker' } });
  expect(screen.getByRole('alert').textContent).toContain('лише адміністратору');
  expect(screen.queryByRole('button', { name: 'Перемістити в кошик' })).toBeNull();
});
