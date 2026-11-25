import { saveOrderLabor } from '@/features/order-labor/api/service';
import { saveOrderExpense } from '@/features/order-expenses/api/service';
import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmEditorDialog } from '../components/editor-dialog';
import { updateOrder } from '../api/service';
import { consumeStock } from '@/features/inventory/api/service';
import type { CrmWorkspace, RepairOrder } from '../api/types';
import type { InventoryData } from '@/features/inventory/api/types';

vi.mock('../api/service', () => ({
  updateOrder: vi.fn(),
  createOrder: vi.fn(),
  getWorkspace: vi.fn(),
  updateWorkflow: vi.fn(),
  advanceOrder: vi.fn(),
  receivePayment: vi.fn(),
  reversePayment: vi.fn(),
  refundPayment: vi.fn()
}));
vi.mock('@/features/inventory/api/service', () => ({
  getInventory: vi.fn(async () => stock),
  getOrderInventory: vi.fn(async () => stock),
  consumeStockBatch: vi.fn(),
  consumeStock: vi.fn(),
  editConsumption: vi.fn(),
  reverseConsumption: vi.fn()
}));
vi.mock('@/features/inventory/api/search-service', () => ({
  getInventoryItems: vi.fn(async () => ({
    items: stock.items,
    total: stock.items.length,
    page: 1,
    pageSize: 50
  }))
}));
const order: RepairOrder = {
  id: '00000000-0000-4000-8000-000000000001',
  number: 1001,
  requestId: null,
  customerId: '00000000-0000-4000-8000-000000000011',
  vehicleId: '00000000-0000-4000-8000-000000000012',
  description: 'Фарбування бампера',
  createdAt: '2026-11-01',
  status: 'in_progress',
  actualIntakeDate: '2026-11-01',
  actualReadyDate: null,
  actualDeliveryDate: null,
  plannedIntakeDate: '2026-11-01',
  plannedDeliveryDate: '2026-12-01',
  workflowRevision: 3,
  items: [{ description: 'Бампер', quantity: 1, unitPriceCents: 100000 }],
  totalCents: 100000,
  assigneeId: 'admin',
  assigneeName: 'Адміністратор'
};
const data: CrmWorkspace = {
  customers: [
    {
      id: '00000000-0000-4000-8000-000000000011',
      name: 'Олена',
      phone: '0501234567',
      notes: '',
      createdAt: ''
    }
  ],
  vehicles: [
    {
      id: '00000000-0000-4000-8000-000000000012',
      customerId: '00000000-0000-4000-8000-000000000011',
      make: 'Ford',
      model: 'Focus',
      plate: 'TEST1001',
      year: 2020,
      vin: 'WVWZZZ1JZXW000001'
    }
  ],
  requests: [],
  orders: [order],
  events: [],
  payments: [],
  access: { userId: 'admin', orgId: 'org_A', role: 'admin' },
  team: [{ id: 'admin', name: 'Адміністратор', role: 'admin', identifier: 'admin@example.com' }]
};
const stock: InventoryData = {
  access: data.access!,
  movements: [],
  items: [
    {
      id: '00000000-0000-4000-8000-000000000002',
      name: 'Лак Sprint',
      tags: ['Розхідник'],
      unit: 'л',
      notes: '',
      archived: false,
      locked: true,
      balanceMilli: 1000,
      totalCostCents: 100000,
      valuationRevision: 1
    }
  ]
};
function show(current = data, close = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const view = (workspace: CrmWorkspace) => (
    <QueryClientProvider client={client}>
      <CrmEditorDialog
        editor={{ type: 'order', order }}
        data={workspace}
        onClose={close}
        onSelectOrder={vi.fn()}
      />
    </QueryClientProvider>
  );
  return { ...render(view(current)), close, refresh: (workspace: CrmWorkspace) => view(workspace) };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateOrder).mockResolvedValue({ ok: true, data: null });
});

test('six tabs show one accessible panel, preserve order drafts and keep only the active form actions', async () => {
  const user = userEvent.setup();
  const { close } = show();
  expect(screen.getAllByRole('tab')).toHaveLength(6);
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  const description = screen.getByRole('textbox', { name: /Опис замовлення/ });
  await user.clear(description);
  await user.type(description, 'Нове фарбування');
  await user.click(screen.getByRole('tab', { name: 'Роботи' }));
  expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  await user.clear(screen.getByRole('textbox', { name: /Робота 1/ }));
  await user.type(screen.getByRole('textbox', { name: /Робота 1/ }), 'Капот');
  await user.click(screen.getByRole('tab', { name: 'Основне' }));
  expect(
    (screen.getByRole('textbox', { name: /Опис замовлення/ }) as HTMLTextAreaElement).value
  ).toBe('Нове фарбування');
  expect(screen.getByRole('tab', { name: 'Основне' }).getAttribute('data-dirty')).not.toBeNull();
  expect(screen.getByRole('tab', { name: 'Роботи' }).getAttribute('data-dirty')).not.toBeNull();
  await user.click(screen.getByRole('tab', { name: 'Роботи' }));
  expect((screen.getByRole('textbox', { name: /Робота 1/ }) as HTMLInputElement).value).toBe(
    'Капот'
  );
  const save = screen.getByRole('button', {
    name: 'Зберегти замовлення'
  }) as HTMLButtonElement;
  const target = document.getElementById(save.getAttribute('form')!);
  expect(target?.closest('[role=tabpanel]')?.getAttribute('hidden')).toBeNull();
  const ids = [...document.querySelectorAll('form[id]')].map((element) => element.id);
  expect(new Set(ids).size).toBe(ids.length);
  await user.click(screen.getByRole('button', { name: 'Закрити' }));
  expect(screen.getByRole('alertdialog')).toBeDefined();
  expect(close).not.toHaveBeenCalled();
});

test('validation opens the tab containing an invalid field, then saving keeps the order open and clears dirty state', async () => {
  const user = userEvent.setup();
  const { close } = show();
  await user.click(screen.getByRole('tab', { name: 'Роботи' }));
  await user.clear(screen.getByRole('textbox', { name: /Робота 1/ }));
  await user.click(screen.getByRole('tab', { name: 'Основне' }));
  await user.click(screen.getByRole('button', { name: 'Зберегти замовлення' }));
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: 'Роботи' }).getAttribute('aria-selected')).toBe('true')
  );
  expect(updateOrder).not.toHaveBeenCalled();
  await user.type(screen.getByRole('textbox', { name: /Робота 1/ }), 'Двері');
  await user.click(screen.getByRole('button', { name: 'Зберегти замовлення' }));
  await waitFor(() => expect(updateOrder).toHaveBeenCalledOnce());
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: 'Роботи' }).hasAttribute('data-dirty')).toBe(false)
  );
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeDefined();
});

test('material dialog saves immediately, blocks dismissal while pending and leaves the order open', async () => {
  const user = userEvent.setup();
  const { close } = show();
  await user.click(screen.getByRole('tab', { name: 'Матеріали і субпідряд' }));
  await user.click(await screen.findByRole('button', { name: 'Додати списання' }));
  const dialog = screen.getByRole('dialog', { name: 'Нове списання' });
  await user.click(within(dialog).getByRole('combobox', { name: /^Матеріал/ }));
  await user.click(await screen.findByRole('option', { name: /Лак Sprint/ }));
  await user.type(within(dialog).getByRole('textbox', { name: /^Кількість/ }), '0,8');
  let finish: ((value: Awaited<ReturnType<typeof consumeStock>>) => void) | undefined;
  vi.mocked(consumeStock).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await user.click(within(dialog).getByRole('button', { name: 'Списати' }));
  await waitFor(() => expect(consumeStock).toHaveBeenCalledOnce());
  await user.keyboard('{Escape}');
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Нове списання' })).toBeDefined();
  finish?.({ ok: true, data: undefined });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Нове списання' })).toBeNull());
  expect(screen.getByRole('dialog', { name: 'Замовлення №1001' })).toBeDefined();
});

test('a background update preserves the draft and submits its original revision for conflict detection', async () => {
  const user = userEvent.setup();
  const view = show();
  await user.clear(screen.getByRole('textbox', { name: /Опис замовлення/ }));
  await user.type(screen.getByRole('textbox', { name: /Опис замовлення/ }), 'Моя чернетка');
  const newer = {
    ...data,
    orders: [{ ...order, description: 'Зміна іншого адміністратора', workflowRevision: 4 }]
  };
  view.rerender(view.refresh(newer));
  expect(
    (screen.getByRole('textbox', { name: /Опис замовлення/ }) as HTMLTextAreaElement).value
  ).toBe('Моя чернетка');
  vi.mocked(updateOrder).mockResolvedValue({
    ok: false,
    error: 'Запис уже змінено в іншому вікні'
  });
  await user.click(screen.getByRole('button', { name: 'Зберегти замовлення' }));
  await waitFor(() =>
    expect(updateOrder).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRevision: 3, description: 'Моя чернетка' })
    )
  );
  expect(
    await within(screen.getByRole('tabpanel')).findByText('Запис уже змінено в іншому вікні')
  ).toBeDefined();
});

test('subcontract dialog saves internal costs independently from client work', async () => {
  const user = userEvent.setup();
  show();
  vi.mocked(saveOrderExpense).mockResolvedValue({ ok: true, data: 'expense-id' });
  await user.click(screen.getByRole('tab', { name: 'Матеріали і субпідряд' }));
  await user.click(await screen.findByRole('button', { name: 'Додати субпідряд' }));
  await user.click(screen.getByRole('combobox', { name: /Назва витрати/ }));
  await user.click(await screen.findByRole('option', { name: 'Пайка' }));
  await user.click(screen.getByRole('combobox', { name: /Субпідрядник/ }));
  await user.click(await screen.findByRole('option', { name: /^Адміністратор/ }));
  await user.type(screen.getByRole('textbox', { name: 'Примітка' }), 'Пайка бампера');
  await user.type(screen.getByRole('textbox', { name: /Вартість субпідряду/ }), '2500');
  await user.click(screen.getByRole('button', { name: 'Зберегти витрату' }));
  await waitFor(() =>
    expect(saveOrderExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 'org_A',
        orderId: order.id,
        expectedRevision: 3,
        amount: '2500',
        contractorUserId: 'admin',
        expenseNameId: 'soldering',
        note: 'Пайка бампера'
      })
    )
  );
  expect(updateOrder).not.toHaveBeenCalled();
});

test('role settings preview wages, save independently and keep the next revision after saving', async () => {
  const user = userEvent.setup();
  show();
  vi.mocked(saveOrderLabor).mockResolvedValue({ ok: true, data: null });
  await user.click(screen.getByRole('tab', { name: 'Команда і зарплата' }));
  const panel = await screen.findByRole('tabpanel');
  await user.clear(await within(panel).findByRole('textbox', { name: /Сума полірування, грн/ }));
  await user.type(within(panel).getByRole('textbox', { name: /Сума полірування, грн/ }), '200');
  await user.click(within(panel).getByRole('combobox', { name: /Полірувальник/ }));
  await user.click(await screen.findByRole('option', { name: /^Адміністратор/ }));
  const share = within(panel).getByRole('textbox', { name: /Частка: Полірувальник, %/ });
  await user.clear(share);
  await user.type(share, '50');
  await user.click(screen.getByRole('button', { name: 'Зберегти умови нарахування' }));
  await waitFor(() => expect(saveOrderLabor).toHaveBeenCalledOnce());
  expect(vi.mocked(saveOrderLabor).mock.calls[0][0]).toMatchObject({
    expectedRevision: 3,
    labor: { polishingCents: 20000, polisher: { workerId: 'admin', shareBps: 5000 } }
  });
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: 'Команда і зарплата' }).hasAttribute('data-dirty')).toBe(
      false
    )
  );
  await user.click(screen.getByRole('button', { name: 'Зберегти умови нарахування' }));
  await waitFor(() => expect(saveOrderLabor).toHaveBeenCalledTimes(2));
  expect(vi.mocked(saveOrderLabor).mock.calls[1][0].expectedRevision).toBe(4);
  expect(updateOrder).not.toHaveBeenCalled();
});

test('a concurrent role update preserves the draft and its original revision on failure', async () => {
  const user = userEvent.setup();
  const view = show();
  await user.click(screen.getByRole('tab', { name: 'Команда і зарплата' }));
  const share = await screen.findByRole('textbox', { name: /Частка: Маляр/ });
  await user.clear(share);
  await user.type(share, '70');
  view.rerender(view.refresh({ ...data, orders: [{ ...order, workflowRevision: 4 }] }));
  vi.mocked(saveOrderLabor).mockResolvedValue({ ok: false, error: 'Замовлення вже змінено' });
  await user.click(screen.getByRole('button', { name: 'Зберегти умови нарахування' }));
  await waitFor(() => expect(saveOrderLabor).toHaveBeenCalledOnce());
  expect(vi.mocked(saveOrderLabor).mock.calls[0][0]).toMatchObject({
    expectedRevision: 3,
    labor: { painter: { shareBps: 7000 } }
  });
  expect((share as HTMLInputElement).value).toBe('70');
  expect(await screen.findByText('Замовлення вже змінено')).toBeDefined();
});
