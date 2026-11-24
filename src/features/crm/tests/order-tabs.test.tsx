import { saveOrderExpense } from '@/features/order-expenses/api/service';
import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CrmEditorDialog } from '../components/editor-dialog';
import { updateOrder } from '../api/service';
import { consumeStockBatch } from '@/features/inventory/api/service';
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
  consumeStockBatch: vi.fn(),
  reverseConsumption: vi.fn()
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

test('five tabs show one accessible panel, preserve order drafts and keep only the active form actions', async () => {
  const user = userEvent.setup();
  const { close } = show();
  expect(screen.getAllByRole('tab')).toHaveLength(5);
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

test('a material draft survives tab switches and a pending batch disables navigation and dismissal', async () => {
  const user = userEvent.setup();
  const { close } = show();
  await user.click(screen.getByRole('tab', { name: 'Матеріали і витрати' }));
  await user.click(await screen.findByRole('button', { name: 'Додати списання' }));
  await user.click(screen.getByRole('combobox', { name: /^Матеріал/ }));
  await user.click(await screen.findByRole('option', { name: /Лак Sprint/ }));
  await user.type(screen.getByRole('textbox', { name: /^Кількість/ }), '0,8');
  await user.click(screen.getByRole('tab', { name: 'Основне' }));
  expect(screen.queryByRole('button', { name: 'Списати матеріали' })).toBeNull();
  await user.click(screen.getByRole('tab', { name: 'Матеріали і витрати' }));
  expect((screen.getByRole('textbox', { name: /^Кількість/ }) as HTMLInputElement).value).toBe(
    '0,8'
  );
  let finish: ((value: Awaited<ReturnType<typeof consumeStockBatch>>) => void) | undefined;
  vi.mocked(consumeStockBatch).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await user.click(screen.getByRole('button', { name: 'Списати матеріали' }));
  await waitFor(() =>
    expect(
      screen
        .getAllByRole('tab')
        .every(
          (tab) =>
            (tab as HTMLButtonElement).disabled || tab.getAttribute('aria-disabled') === 'true'
        )
    ).toBe(true)
  );
  await user.keyboard('{Escape}');
  expect(close).not.toHaveBeenCalled();
  finish?.({ ok: true, data: undefined });
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Списати матеріали' })).toBeNull()
  );
  expect(screen.getByRole('dialog')).toBeDefined();
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

test('subcontract draft survives tab switches and saves internal costs independently from client work', async () => {
  const user = userEvent.setup();
  show();
  vi.mocked(saveOrderExpense).mockResolvedValue({ ok: true, data: 'expense-id' });
  await user.click(screen.getByRole('tab', { name: 'Матеріали і витрати' }));
  await user.click(await screen.findByRole('button', { name: 'Додати витрату' }));
  await user.click(screen.getByRole('combobox', { name: /Назва витрати/ }));
  await user.click(await screen.findByRole('option', { name: 'Пайка' }));
  await user.click(screen.getByRole('combobox', { name: /Субпідрядник/ }));
  await user.click(await screen.findByRole('option', { name: 'Адміністратор' }));
  await user.type(screen.getByRole('textbox', { name: 'Примітка' }), 'Пайка бампера');
  await user.type(screen.getByRole('textbox', { name: /Вартість субпідряду/ }), '2500');
  await user.click(screen.getByRole('tab', { name: 'Роботи' }));
  expect(
    (screen.getByRole('button', { name: 'Зберегти замовлення' }) as HTMLButtonElement).disabled
  ).toBe(true);
  await user.click(screen.getByRole('tab', { name: 'Матеріали і витрати' }));
  expect(screen.getByRole('combobox', { name: /Назва витрати/ }).textContent).toContain('Пайка');
  expect((screen.getByRole('textbox', { name: 'Примітка' }) as HTMLTextAreaElement).value).toBe(
    'Пайка бампера'
  );
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
