import { advanceOrder, updateWorkflow } from '../api/service';
import { saveOrderEconomics } from '@/features/order-economics/api/service';
import { getPeriodReport } from '@/features/workshop-reports/api/service';
import { reportQueries } from '@/features/workshop-reports/api/queries';
import { reportFixture } from '@/features/workshop-reports/tests/fixtures';
import type { StockMovement } from '@/features/inventory/api/types';
import {
  recordSettlement,
  reverseSettlement,
  previewFinancialCorrection,
  applyFinancialCorrection,
  updateDefaultShare
} from '@/features/order-economics/api/finance-service';
import type { SettlementEvent } from '@/features/order-economics/api/types';
import { businessToday } from '../lib/workflow';
import { beforeEach, expect, test, vi } from 'vitest';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getOrganizationRepository } from '../server/repository';
import { getOrganizationContext } from '../server/organization';
import type { CrmWorkspace, RepairOrder } from '../api/types';
import {
  updateOrder,
  createCustomer,
  updateCustomer,
  createOrder,
  getOrderDocument,
  getWorkspace
} from '../api/service';
import { crmQueries } from '../api/queries';
import {
  receivePayment,
  reversePayment,
  refundPayment,
  addVehicleModel,
  getVehicleCatalog
} from '../api/service';
import {
  getInventory,
  createStockItem,
  updateStockItem,
  archiveStockItem,
  receiveStock,
  adjustStock,
  consumeStock,
  reverseConsumption,
  valueStockBalance
} from '@/features/inventory/api/service';

vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(), clerkClient: vi.fn() }));
vi.mock('../server/repository', () => ({
  CrmError: class CrmError extends Error {},
  getOrganizationRepository: vi.fn()
}));
const memberships = vi.fn();
const workspace: CrmWorkspace = {
  customers: [],
  vehicles: [],
  orders: [],
  requests: [],
  events: []
};
const repository = {
  payments: {
    receive: vi.fn(() => 'payment-created'),
    reverse: vi.fn(() => 'payment-reversed'),
    refund: vi.fn(() => 'refund-created')
  },
  settlements: { cash: vi.fn(), reverse: vi.fn() },
  correctOrderEconomics: vi.fn(() => ({ after: {} })),
  updateFinanceSettings: vi.fn(),
  inventory: {
    items: vi.fn(() => []),
    movements: vi.fn(() => []),
    createItem: vi.fn(),
    updateItem: vi.fn(),
    archive: vi.fn(),
    receive: vi.fn(),
    adjust: vi.fn(),
    consume: vi.fn(),
    reverse: vi.fn(),
    valueOpeningBalance: vi.fn()
  },
  workspace: vi.fn(() => workspace),
  reportSnapshot: vi.fn<() => { workspace: CrmWorkspace; movements: StockMovement[] }>(),
  addVehicleModel: vi.fn(() => '001'),
  vehicleModels: vi.fn(() => [
    { make: 'ZEEKR', model: '001' },
    { make: 'ZEEKR', model: '002' }
  ]),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  createOrder: vi.fn(() => 'order-created'),
  updateOrder: vi.fn(),
  updateWorkflow: vi.fn()
};

test('inventory writes reject workers and stale organizations; actors come from verified membership', async () => {
  const org = 'org_A';
  const value = {
    itemId: '00000000-0000-4000-8000-000000000001',
    quantity: '1',
    totalAmount: '100',
    currency: 'UAH' as const,
    exchangeRate: '1',
    operationId: '00000000-0000-4000-8000-000000000002',
    note: ''
  };
  memberships.mockResolvedValue({
    totalCount: 1,
    data: [
      {
        role: 'org:member',
        publicUserData: { userId: 'user_admin', identifier: 'worker@example.com' }
      }
    ]
  });
  expect((await getInventory(org)).items).toEqual([]);
  for (const result of [
    await createStockItem(org, { name: 'Фарба', unit: 'л', notes: '' }),
    await updateStockItem(org, { id: value.itemId, name: 'Фарба', unit: 'л', notes: '' }),
    await archiveStockItem(org, { id: value.itemId, archived: true }),
    await valueStockBalance(org, {
      itemId: value.itemId,
      operationId: value.operationId,
      expectedBalanceMilli: 1000,
      expectedRevision: 0,
      totalAmount: '100',
      note: 'Оцінка'
    }),
    await receiveStock(org, value),
    await adjustStock(org, value),
    await consumeStock(org, { ...value, orderId: value.itemId }),
    await reverseConsumption(org, {
      operationId: value.operationId,
      movementId: value.itemId,
      note: 'Помилка'
    })
  ])
    expect(result.ok).toBe(false);
  expect(repository.inventory.consume).not.toHaveBeenCalled();
  expect(repository.inventory.valueOpeningBalance).not.toHaveBeenCalled();
  await expect(getInventory('org_B')).rejects.toThrow('Автомалярку змінено');
  memberships.mockResolvedValue({
    totalCount: 1,
    data: [
      {
        role: 'org:admin',
        publicUserData: {
          userId: 'user_admin',
          firstName: 'Олена',
          identifier: 'owner@example.com'
        }
      }
    ]
  });
  expect((await receiveStock('org_B', value)).ok).toBe(false);
  expect(repository.inventory.receive).not.toHaveBeenCalled();
  expect((await receiveStock(org, value)).ok).toBe(true);
  expect(repository.inventory.receive).toHaveBeenCalledWith(value, {
    id: 'user_admin',
    name: 'Олена'
  });
});
beforeEach(() => {
  vi.clearAllMocks();
  repository.workspace.mockReturnValue(workspace);
  repository.reportSnapshot.mockImplementation(() => ({
    workspace: repository.workspace(),
    movements: repository.inventory.movements()
  }));
  vi.mocked(getOrganizationRepository).mockReturnValue(
    repository as unknown as ReturnType<typeof getOrganizationRepository>
  );
  vi.mocked(auth).mockResolvedValue({ userId: 'user_admin', orgId: 'org_A' } as unknown as Awaited<
    ReturnType<typeof auth>
  >);
  vi.mocked(clerkClient).mockResolvedValue({
    organizations: { getOrganizationMembershipList: memberships }
  } as unknown as Awaited<ReturnType<typeof clerkClient>>);
  memberships.mockResolvedValue({
    totalCount: 1,
    data: [
      {
        role: 'org:admin',
        publicUserData: {
          userId: 'user_admin',
          firstName: 'Олена',
          identifier: 'owner@example.com'
        },
        privateMetadata: { sensitive: true }
      }
    ]
  });
});

test('membership and role are read from Clerk and private metadata is not exposed', async () => {
  const data = await getWorkspace();
  await expect(getWorkspace('org_B')).rejects.toThrow('Автомалярку змінено');
  expect(data.access).toEqual({ userId: 'user_admin', orgId: 'org_A', role: 'admin' });
  expect(data.team).toEqual([
    { id: 'user_admin', name: 'Олена', identifier: 'owner@example.com', role: 'admin' }
  ]);
  expect(getOrganizationRepository).toHaveBeenCalledWith('org_A', 'user_admin', true);
  await expect(getWorkspace('org_B')).rejects.toThrow('Автомалярку змінено');
  expect(crmQueries.workspace('user_admin', 'org_A').queryKey).not.toEqual(
    crmQueries.workspace('user_admin', 'org_B').queryKey
  );
});

test('missing session, missing organization, removed membership and unknown role fail closed', async () => {
  vi.mocked(auth).mockResolvedValue({ userId: null, orgId: null } as unknown as Awaited<
    ReturnType<typeof auth>
  >);
  await expect(getOrganizationContext()).rejects.toThrow('Увійдіть');
  vi.mocked(auth).mockResolvedValue({ userId: 'user_admin', orgId: null } as unknown as Awaited<
    ReturnType<typeof auth>
  >);
  await expect(getOrganizationContext()).rejects.toThrow('Оберіть');
  vi.mocked(auth).mockResolvedValue({ userId: 'user_admin', orgId: 'org_A' } as unknown as Awaited<
    ReturnType<typeof auth>
  >);
  memberships.mockResolvedValue({ totalCount: 0, data: [] });
  await expect(getOrganizationContext()).rejects.toThrow('активного доступу');
  memberships.mockResolvedValue({
    totalCount: 1,
    data: [{ role: 'org:custom', publicUserData: { userId: 'user_admin' } }]
  });
  await expect(getOrganizationContext()).rejects.toThrow('активного доступу');
  expect(getOrganizationRepository).not.toHaveBeenCalled();
});

test('worker cannot invoke an administrative action and foreign print IDs are not found', async () => {
  memberships.mockResolvedValue({
    totalCount: 1,
    data: [
      {
        role: 'org:member',
        publicUserData: { userId: 'user_admin', identifier: 'worker@example.com' }
      }
    ]
  });
  const result = await createCustomer({ name: 'Спроба', phone: '0501234567', notes: '' });
  expect(result.ok).toBe(false);
  expect(repository.workspace().customers).toHaveLength(0);
  expect(await getOrderDocument('other-org-order')).toBeNull();
});

test('creating an order validates a mandatory active member of the current organization, including an admin', async () => {
  const input = {
    customerId: '00000000-0000-4000-8000-000000000001',
    vehicleId: '00000000-0000-4000-8000-000000000002',
    requestId: '',
    description: 'Фарбування',
    items: [{ description: 'Робота', quantity: 1, unitPrice: 100 }]
  };
  expect((await createOrder(input)).ok).toBe(false);
  expect((await createOrder({ ...input, assigneeId: 'user_foreign' })).ok).toBe(false);
  expect(repository.createOrder).not.toHaveBeenCalled();
  expect((await createOrder({ ...input, assigneeId: 'user_admin' })).ok).toBe(true);
  expect(repository.createOrder).toHaveBeenCalledWith(
    expect.objectContaining({ assigneeId: 'user_admin' }),
    'Олена',
    { id: 'user_admin', name: 'Олена' }
  );
});

test('reassignment validates the new member, preserves inactive historical assignees, and cannot spoof the actor', async () => {
  const current: RepairOrder = {
    id: '00000000-0000-4000-8000-000000000001',
    number: 1,
    requestId: null,
    customerId: 'c',
    vehicleId: 'v',
    description: 'Роботи',
    createdAt: '',
    status: 'in_progress',
    plannedIntakeDate: null,
    plannedDeliveryDate: null,
    actualIntakeDate: '2020-01-01',
    actualReadyDate: null,
    actualDeliveryDate: null,
    items: [{ description: 'Робота', quantity: 1, unitPriceCents: 10000 }],
    totalCents: 10000,
    assigneeId: 'user_removed',
    assigneeName: 'Колишній маляр'
  };
  repository.workspace.mockReturnValue({ ...workspace, orders: [current] });
  const input = {
    id: current.id,
    description: 'Оновлено',
    items: [{ description: 'Робота', quantity: 1, unitPrice: 100 }]
  };
  expect((await updateOrder({ ...input, assigneeId: 'user_removed' })).ok).toBe(true);
  expect(repository.updateOrder).toHaveBeenLastCalledWith(
    expect.objectContaining({ assigneeId: undefined }),
    undefined,
    { id: 'user_admin', name: 'Олена' }
  );
  expect((await updateOrder({ ...input, assigneeId: 'user_other_org' })).ok).toBe(false);
  const forged = { ...input, assigneeId: 'user_admin', actor: { id: 'forged', name: 'Підробка' } };
  expect((await updateOrder(forged)).ok).toBe(true);
  expect(repository.updateOrder).toHaveBeenLastCalledWith(
    expect.objectContaining({ assigneeId: 'user_admin' }),
    'Олена',
    { id: 'user_admin', name: 'Олена' }
  );
});

test('worker advances any shop order through a dedicated strict endpoint but cannot edit plans or priced work', async () => {
  memberships.mockResolvedValue({
    totalCount: 1,
    data: [
      {
        role: 'org:member',
        publicUserData: { userId: 'user_admin', identifier: 'worker@example.com' }
      }
    ]
  });
  const order: RepairOrder = {
    id: '00000000-0000-4000-8000-000000000001',
    number: 1,
    requestId: null,
    customerId: 'c',
    vehicleId: 'v',
    description: 'Роботи',
    createdAt: '',
    status: 'in_progress',
    plannedIntakeDate: '2020-01-01',
    plannedDeliveryDate: '2020-01-10',
    actualIntakeDate: '2020-01-02',
    actualReadyDate: null,
    actualDeliveryDate: null,
    items: [],
    totalCents: 0,
    assigneeId: 'user_other',
    workflowRevision: 2
  };
  repository.workspace.mockReturnValue({ ...workspace, orders: [order] });
  const input = { id: order.id, expectedStatus: order.status, expectedRevision: 2 };
  expect((await advanceOrder(input)).ok).toBe(true);
  expect(repository.updateWorkflow).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'ready',
      actualReadyDate: businessToday(),
      plannedDeliveryDate: '2020-01-10',
      actualIntakeDate: '2020-01-02'
    }),
    { id: 'user_admin', name: 'worker@example.com' }
  );
  repository.updateWorkflow.mockClear();
  const forged = { ...input, actualReadyDate: '1999-01-01', status: 'delivered', unitPrice: 1 };
  expect((await advanceOrder(forged)).ok).toBe(false);
  expect((await advanceOrder({ ...input, expectedRevision: 1 })).ok).toBe(false);
  expect((await advanceOrder({ ...input, id: '00000000-0000-4000-8000-000000000099' })).ok).toBe(
    false
  );
  expect(
    (
      await updateOrder({
        id: order.id,
        description: 'Змінено',
        items: [{ description: 'Роботи', quantity: 1, unitPrice: 1 }]
      })
    ).ok
  ).toBe(false);
  expect(
    (
      await updateWorkflow({
        kind: 'order',
        id: order.id,
        expectedStatus: order.status,
        expectedRevision: 2,
        status: 'delivered',
        plannedIntakeDate: '',
        plannedDeliveryDate: '',
        actualIntakeDate: '2020-01-02',
        actualReadyDate: '2020-01-03',
        actualDeliveryDate: '2020-01-04',
        note: 'Підробка'
      })
    ).ok
  ).toBe(false);
  expect(repository.updateWorkflow).not.toHaveBeenCalled();
});

test('custom model writes require admin and matching organization; catalog merges saved models offline', async () => {
  expect((await addVehicleModel({ orgId: 'org_B', make: 'ZEEKR', model: '001' })).ok).toBe(false);
  expect(repository.addVehicleModel).not.toHaveBeenCalled();
  expect(await addVehicleModel({ orgId: 'org_A', make: ' zeekr ', model: ' 001 ' })).toEqual({
    ok: true,
    data: '001'
  });
  expect(repository.addVehicleModel).toHaveBeenCalledWith({ make: 'ZEEKR', model: '001' });
  const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
  try {
    const catalog = await getVehicleCatalog('ZEEKR', 'org_A');
    expect(catalog.models.filter((model) => model === '001')).toHaveLength(1);
    expect(catalog.models).toContain('002');
    expect(catalog.warning).toBeTruthy();
    await expect(getVehicleCatalog('ZEEKR', 'org_B')).rejects.toThrow('Автомалярку змінено');
  } finally {
    fetcher.mockRestore();
  }
  expect(crmQueries.catalog('ZEEKR', 'org_A').queryKey).not.toEqual(
    crmQueries.catalog('ZEEKR', 'org_B').queryKey
  );
  repository.addVehicleModel.mockClear();
  memberships.mockResolvedValue({
    totalCount: 1,
    data: [
      {
        role: 'org:member',
        publicUserData: { userId: 'user_admin', identifier: 'worker@example.com' }
      }
    ]
  });
  expect((await addVehicleModel({ orgId: 'org_A', make: 'ZEEKR', model: '001' })).ok).toBe(false);
  expect(repository.addVehicleModel).not.toHaveBeenCalled();
});

test('only admins record or reverse payments and requests cannot target a stale shop', async () => {
  const input = {
    orderId: '00000000-0000-4000-8000-000000000001',
    operationId: '00000000-0000-4000-8000-000000000002',
    amount: '10,25',
    note: ''
  };
  const reversal = { operationId: input.operationId, paymentId: input.orderId, note: 'Помилка' };
  expect((await receivePayment('org_B', input)).ok).toBe(false);
  expect((await reversePayment('org_B', reversal)).ok).toBe(false);
  expect(repository.payments.receive).not.toHaveBeenCalled();
  expect(await receivePayment('org_A', input)).toEqual({ ok: true, data: 'payment-created' });
  expect(repository.payments.receive).toHaveBeenCalledWith(input, {
    id: 'user_admin',
    name: 'Олена'
  });
  expect((await reversePayment('org_A', reversal)).ok).toBe(true);
  repository.payments.receive.mockClear();
  repository.payments.reverse.mockClear();
  memberships.mockResolvedValue({
    totalCount: 1,
    data: [
      {
        role: 'org:member',
        publicUserData: { userId: 'user_admin', identifier: 'worker@example.com' }
      }
    ]
  });
  expect((await receivePayment('org_A', input)).ok).toBe(false);
  expect((await reversePayment('org_A', reversal)).ok).toBe(false);
  expect(repository.payments.receive).not.toHaveBeenCalled();
  expect(repository.payments.reverse).not.toHaveBeenCalled();
});

test('customer editing requires admin, the current shop and valid contact values', async () => {
  const input = {
    id: '00000000-0000-4000-8000-000000000001',
    expectedRevision: 0,
    name: 'Олена',
    contacts: [{ type: 'email' as const, value: 'olena@example.com' }],
    notes: ''
  };
  expect((await updateCustomer({ ...input, orgId: 'org_B' })).ok).toBe(false);
  expect(repository.updateCustomer).not.toHaveBeenCalled();
  expect((await updateCustomer({ ...input, orgId: 'org_A' })).ok).toBe(true);
  expect(repository.updateCustomer).toHaveBeenCalledWith(input);
  repository.updateCustomer.mockClear();
  expect(
    (
      await updateCustomer({
        ...input,
        contacts: [{ type: 'email', value: 'invalid' }],
        orgId: 'org_A'
      })
    ).ok
  ).toBe(false);
  expect(repository.updateCustomer).not.toHaveBeenCalled();
  memberships.mockResolvedValue({
    totalCount: 1,
    data: [
      {
        role: 'org:member',
        publicUserData: { userId: 'user_admin', identifier: 'worker@example.com' }
      }
    ]
  });
  expect((await updateCustomer({ ...input, orgId: 'org_A' })).ok).toBe(false);
  expect(repository.updateCustomer).not.toHaveBeenCalled();
});

test('detailed check validates shop, role and live membership; stored worker names cannot be forged', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const current = { id, description: 'Робота', workflowRevision: 0 } as RepairOrder;
  repository.workspace.mockReturnValue({ ...workspace, orders: [current] });
  const input = {
    orgId: 'org_A',
    orderId: id,
    expectedRevision: 0,
    details: {
      employeeShareBps: 6000,
      painterId: 'user_admin',
      polisherId: '',
      assemblerId: '',
      lines: [
        {
          id: '00000000-0000-4000-8000-000000000002',
          kind: 'painting' as const,
          description: 'Бампер',
          quantity: 1,
          unitPriceCents: 100000,
          polishingCents: 0,
          subcontractCostCents: 0,
          contractorName: ''
        }
      ]
    }
  };
  expect((await saveOrderEconomics({ ...input, orgId: 'org_B' })).ok).toBe(false);
  expect(
    (
      await saveOrderEconomics({
        ...input,
        details: { ...input.details, painterId: 'user_outside' }
      })
    ).ok
  ).toBe(false);
  expect(repository.updateOrder).not.toHaveBeenCalled();
  expect((await saveOrderEconomics(input)).ok).toBe(true);
  expect(repository.updateOrder).toHaveBeenCalledWith(
    expect.objectContaining({ id, expectedRevision: 0 }),
    undefined,
    { id: 'user_admin', name: 'Олена' },
    { details: input.details, workerNames: { user_admin: 'Олена' } }
  );
  repository.updateOrder.mockClear();
  memberships.mockResolvedValue({
    totalCount: 1,
    data: [
      {
        role: 'org:member',
        publicUserData: { userId: 'user_admin', identifier: 'worker@example.com' }
      }
    ]
  });
  expect((await saveOrderEconomics(input)).ok).toBe(false);
  expect(repository.updateOrder).not.toHaveBeenCalled();
});

test('client document service removes the internal economics payload', async () => {
  const id = '00000000-0000-4000-8000-000000000001';
  repository.workspace.mockReturnValue({
    ...workspace,
    orders: [
      {
        id,
        customerId: 'c',
        vehicleId: 'v',
        defaultEmployeeShareBps: 6000,
        economics: { painterName: 'Внутрішні дані', employeeShareBps: 6000 }
      } as RepairOrder
    ],
    customers: [{ id: 'c', name: 'Клієнт', phone: '', notes: '', createdAt: '' }],
    vehicles: [
      { id: 'v', customerId: 'c', make: 'Ford', model: 'Focus', year: 2020, plate: '', vin: null }
    ]
  });
  const document = await getOrderDocument(id);
  expect(document).not.toBeNull();
  expect(document!.order).not.toHaveProperty('economics');
  expect(document!.order).not.toHaveProperty('defaultEmployeeShareBps');
  expect(JSON.stringify(document)).not.toContain('Внутрішні дані');
});

test('financial endpoints verify organization, administrator and recipient; actor cannot be forged', async () => {
  const orderId = '00000000-0000-4000-8000-000000000001';
  repository.workspace.mockReturnValue({ ...workspace, orders: [{ id: orderId } as RepairOrder] });
  const cash = {
    orgId: 'org_A',
    orderId,
    operationId: '00000000-0000-4000-8000-000000000002',
    payeeKind: 'worker' as const,
    payeeId: 'user_admin',
    kind: 'payout' as const,
    amount: '100',
    note: ''
  };
  const reversal = {
    orgId: 'org_A',
    operationId: cash.operationId,
    eventId: cash.operationId,
    note: 'Помилка'
  };
  const settings = { orgId: 'org_A', employeeShareBps: 7000, expectedRevision: 0 };
  expect((await recordSettlement({ ...cash, orgId: 'org_B' })).ok).toBe(false);
  expect((await recordSettlement({ ...cash, payeeId: 'user_foreign' })).ok).toBe(false);
  expect(
    (await recordSettlement({ ...cash, payeeKind: 'contractor', payeeId: 'foreign-contractor' })).ok
  ).toBe(false);
  expect((await recordSettlement({ ...cash, actor: { id: 'forged' } } as typeof cash)).ok).toBe(
    false
  );
  expect(repository.settlements.cash).not.toHaveBeenCalled();
  expect((await recordSettlement(cash)).ok).toBe(true);
  expect(repository.settlements.cash).toHaveBeenCalledWith(
    cash,
    { id: 'user_admin', name: 'Олена' },
    { kind: 'worker', id: 'user_admin', name: 'Олена' }
  );
  expect((await reverseSettlement({ ...reversal, orgId: 'org_B' })).ok).toBe(false);
  expect((await updateDefaultShare({ ...settings, orgId: 'org_B' })).ok).toBe(false);
  expect(
    (
      await refundPayment('org_B', {
        orderId,
        operationId: cash.operationId,
        amount: '1',
        note: 'Повернення'
      })
    ).ok
  ).toBe(false);
  expect(repository.settlements.reverse).not.toHaveBeenCalled();
  expect(repository.updateFinanceSettings).not.toHaveBeenCalled();
  expect(repository.payments.refund).not.toHaveBeenCalled();
  memberships.mockResolvedValue({
    totalCount: 1,
    data: [{ role: 'org:member', publicUserData: { userId: 'user_admin' } }]
  });
  repository.settlements.cash.mockClear();
  expect((await recordSettlement(cash)).ok).toBe(false);
  expect((await reverseSettlement(reversal)).ok).toBe(false);
  expect((await updateDefaultShare(settings)).ok).toBe(false);
  expect(
    (
      await refundPayment('org_A', {
        orderId,
        operationId: cash.operationId,
        amount: '1',
        note: 'Повернення'
      })
    ).ok
  ).toBe(false);
  expect(repository.settlements.cash).not.toHaveBeenCalled();
  expect(repository.settlements.reverse).not.toHaveBeenCalled();
  expect(repository.updateFinanceSettings).not.toHaveBeenCalled();
  expect(repository.payments.refund).not.toHaveBeenCalled();
});

test('correction preview and posting reject outsiders and preserve verified historical worker identity', async () => {
  const orderId = '00000000-0000-4000-8000-000000000001';
  const details = {
    employeeShareBps: 6000,
    painterId: 'former_worker',
    polisherId: '',
    assemblerId: '',
    painterName: 'Колишній маляр',
    lines: [
      {
        id: '00000000-0000-4000-8000-000000000002',
        kind: 'painting' as const,
        description: 'Бампер',
        quantity: 1,
        unitPriceCents: 100000,
        polishingCents: 0,
        subcontractCostCents: 0,
        contractorName: ''
      }
    ]
  };
  repository.workspace.mockReturnValue({
    ...workspace,
    orders: [{ id: orderId, economics: details } as RepairOrder]
  });
  const { painterName: _name, ...inputDetails } = details;
  const input = {
    orgId: 'org_A',
    orderId,
    operationId: details.lines[0].id,
    expectedRevision: 1,
    expectedPostingRevision: 1,
    expectedInventoryRevision: '0'.repeat(64),
    details: inputDetails,
    materials: [],
    note: 'Уточнення'
  };
  expect((await previewFinancialCorrection({ ...input, orgId: 'org_B' })).ok).toBe(false);
  expect(
    (
      await applyFinancialCorrection({
        ...input,
        details: { ...inputDetails, painterId: 'foreign_user' }
      })
    ).ok
  ).toBe(false);
  expect(repository.correctOrderEconomics).not.toHaveBeenCalled();
  expect((await previewFinancialCorrection(input)).ok).toBe(true);
  expect(repository.correctOrderEconomics).toHaveBeenLastCalledWith(
    input,
    { former_worker: 'Колишній маляр' },
    { id: 'user_admin', name: 'Олена' },
    true
  );
  expect((await applyFinancialCorrection(input)).ok).toBe(true);
  expect(repository.correctOrderEconomics).toHaveBeenLastCalledWith(
    input,
    { former_worker: 'Колишній маляр' },
    { id: 'user_admin', name: 'Олена' }
  );
  repository.correctOrderEconomics.mockClear();
  memberships.mockResolvedValue({
    totalCount: 1,
    data: [{ role: 'org:member', publicUserData: { userId: 'user_admin' } }]
  });
  expect((await previewFinancialCorrection(input)).ok).toBe(false);
  expect((await applyFinancialCorrection(input)).ok).toBe(false);
  expect(repository.correctOrderEconomics).not.toHaveBeenCalled();
});

test('workers receive only their cash journal while administrators receive all payees', async () => {
  const events = [
    { id: 'own', payee: { kind: 'worker', id: 'user_admin', name: 'Олена' } },
    { id: 'other', payee: { kind: 'worker', id: 'other_worker', name: 'Інший' } },
    { id: 'contractor', payee: { kind: 'contractor', id: 'user_admin', name: 'Підрядник' } }
  ] as SettlementEvent[];
  repository.workspace.mockReturnValue({
    ...workspace,
    finance: {
      postings: [],
      events,
      inventoryRevision: '0'.repeat(64),
      defaultShareBps: 6000,
      settingsRevision: 0
    }
  });
  expect((await getWorkspace()).finance!.events).toEqual(events);
  memberships.mockResolvedValue({
    totalCount: 1,
    data: [{ role: 'org:member', publicUserData: { userId: 'user_admin' } }]
  });
  expect((await getWorkspace()).finance!.events.map((event) => event.id)).toEqual(['own']);
  expect(repository.workspace().finance!.events).toHaveLength(3);
});

test('report service verifies current organization, strict filters and scopes workers on the server', async () => {
  const filters = { from: '2026-11-01', to: '2026-11-30', orderDate: 'ready' as const };
  repository.reportSnapshot.mockReturnValue(reportFixture());
  await expect(getPeriodReport('org_B', filters)).rejects.toThrow('Автомалярку змінено');
  expect(repository.reportSnapshot).not.toHaveBeenCalled();
  expect((await getPeriodReport('org_A', filters)).economics!.checkCents).toBe(1800000);
  await expect(getPeriodReport('org_A', { ...filters, from: '2026-02-30' })).rejects.toThrow();
  await expect(
    getPeriodReport('org_A', { ...filters, workerId: 'q' } as typeof filters)
  ).rejects.toThrow();
  vi.mocked(auth).mockResolvedValue({ userId: 'p', orgId: 'org_A' } as unknown as Awaited<
    ReturnType<typeof auth>
  >);
  memberships.mockResolvedValue({
    totalCount: 1,
    data: [{ role: 'org:member', publicUserData: { userId: 'p', firstName: 'Маляр' } }]
  });
  const result = await getPeriodReport('org_A', filters);
  expect(result.access.role).toBe('worker');
  expect(result.economics).toBeNull();
  expect(result.cash).toBeNull();
  expect(result.materials.rows).toEqual([]);
  expect(result.settlements.payees.map((row) => row.payee.id)).toEqual(['p']);
  expect(JSON.stringify(result)).not.toContain('Полірувальник');
  expect(reportQueries.period('p', 'org_A', filters).queryKey).not.toEqual(
    reportQueries.period('p', 'org_B', filters).queryKey
  );
  expect(reportQueries.period('p', 'org_A', filters).queryKey).not.toEqual(
    reportQueries.period('p', 'org_A', { ...filters, to: '2026-12-31' }).queryKey
  );
});
