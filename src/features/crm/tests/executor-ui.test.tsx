vi.mock('@/features/inventory/api/service', () => import('./inventory-stub'));
import { expect, test, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmEditorDialog } from '../components/editor-dialog';
import { advanceOrder } from '../api/service';
import type { CrmWorkspace, RepairOrder } from '../api/types';
vi.mock('../api/service', () => ({ advanceOrder: vi.fn() }));
const order: RepairOrder = {
  id: '00000000-0000-4000-8000-000000000001',
  number: 1,
  requestId: null,
  customerId: 'c',
  vehicleId: 'v',
  description: 'Фарбування бампера',
  createdAt: '2020-01-01',
  status: 'in_progress',
  plannedIntakeDate: '2020-01-01',
  plannedDeliveryDate: '2020-01-10',
  actualIntakeDate: '2020-01-02',
  actualReadyDate: null,
  actualDeliveryDate: null,
  items: [{ description: 'Робота', quantity: 1, unitPriceCents: 50000 }],
  totalCents: 50000,
  assigneeId: 'user_other',
  assigneeName: 'Інший маляр',
  workflowRevision: 3
};
const data: CrmWorkspace = {
  customers: [],
  vehicles: [],
  requests: [],
  orders: [order],
  events: [],
  access: { userId: 'user_worker', orgId: 'org_A', role: 'worker' },
  team: []
};
function show(record: RepairOrder, close = vi.fn()) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <CrmEditorDialog
        editor={{ type: 'order', order: record }}
        data={{ ...data, orders: [record] }}
        onClose={close}
        onSelectOrder={vi.fn()}
      />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(advanceOrder).mockResolvedValue({ ok: true, data: null });
});
test('worker reads another executor’s order without edit controls and sends only a forward-status intent', async () => {
  const close = vi.fn();
  show(order, close);
  expect(screen.getByText('Фарбування бампера')).toBeDefined();
  expect(screen.getByText('Інший маляр')).toBeDefined();
  expect(screen.queryAllByRole('spinbutton')).toHaveLength(0);
  expect(screen.queryAllByRole('textbox')).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'Зберегти замовлення' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Позначити виданим' })).toBeNull();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Позначити готовим' }));
  await waitFor(() => expect(advanceOrder).toHaveBeenCalledOnce());
  expect(close).not.toHaveBeenCalled();
  expect(advanceOrder).toHaveBeenCalledWith({
    id: order.id,
    expectedStatus: 'in_progress',
    expectedRevision: 3
  });
});
test('missing factual dates explain administrative correction instead of inventing dates', () => {
  show({ ...order, actualIntakeDate: null });
  expect(screen.getByText(/адміністратор має уточнити/)).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Позначити готовим' })).toBeNull();
});
test('ready orders have no next status action', () => {
  show({
    ...order,
    status: 'ready',
    actualReadyDate: '2020-01-03',
    actualDeliveryDate: '2020-01-04'
  });
  expect(screen.getByText('Замовлення готове.')).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Позначити готовим' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Позначити виданим' })).toBeNull();
});

test('pending status update prevents duplicate action and dialog dismissal', async () => {
  let finish: ((value: Awaited<ReturnType<typeof advanceOrder>>) => void) | undefined;
  vi.mocked(advanceOrder).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const close = vi.fn();
  show(order, close);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Позначити готовим' }));
  await waitFor(() =>
    expect((screen.getByRole('button', { name: 'Закрити' }) as HTMLButtonElement).disabled).toBe(
      true
    )
  );
  expect(
    (screen.getByRole('button', { name: 'Позначити готовим' }) as HTMLButtonElement).disabled
  ).toBe(true);
  await user.keyboard('{Escape}');
  expect(close).not.toHaveBeenCalled();
  finish?.({ ok: true, data: null });
  await waitFor(() => expect(advanceOrder).toHaveBeenCalledOnce());
  expect(close).not.toHaveBeenCalled();
});
