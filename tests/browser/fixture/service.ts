import { defaultExpenseNames } from '@/features/order-expenses/lib/names';
import { getInventory } from './inventory-service';
import type { OrderTrashInput } from '@/features/crm/schemas/order-trash';
import { businessToday } from '@/features/crm/lib/workflow';
import { executorTransition } from '@/features/crm/lib/executor-workflow';
import type { AdvanceOrderInput } from '@/features/crm/schemas/crm';
import type { SaveEconomicsInput } from '@/features/order-economics/schemas/details';
import { detailedCheckItems } from '@/features/order-economics/lib/details';
import { previewDetailedEconomics } from '@/features/order-economics/lib/details';
import { paymentDelta } from '@/features/crm/lib/payment-balance';
export { refundPayment } from './finance-service';
import { syncNetFixture } from './net-salary';
import type { CrmWorkspace, TeamMember, Vehicle } from '@/features/crm/api/types';
import {
  updateTeamMemberSchema,
  type UpdateTeamMemberInput
} from '@/features/crm/schemas/team-member';
import { readWorkerSpecialties, readSubcontractPayroll } from '@/features/crm/lib/team-specialties';
import type {
  CustomerInput,
  UpdateCustomerInput,
  VehicleInput,
  OrderInput,
  UpdateOrderInput
} from '@/features/crm/schemas/crm';
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const longDescription =
  'Рихтування та фарбування переднього бампера, підготовка поверхні, підбір кольору та фінішне полірування. '.repeat(
    5
  );
const data: CrmWorkspace = { customers: [], vehicles: [], requests: [], orders: [], events: [] };
export function financeFixtureData(): CrmWorkspace {
  return data;
}
export function persistFlowFixture(): void {
  if (new URLSearchParams(location.search).has('flowDemo'))
    sessionStorage.setItem('workshop-flow', JSON.stringify(data));
}
for (let index = 1; index <= 24; index++) {
  data.customers.push({
    id: uuid(index),
    name: index === 1 ? 'Тестовий клієнт із довгим прізвищем та ім’ям' : `Тестовий клієнт ${index}`,
    phone: '+380501234567',
    notes: 'Нотатка про бажаний колір і особливості ремонту. '.repeat(5),
    createdAt: '2026-10-30T12:00:00Z'
  });
  for (let car = 0; car < (index === 1 ? 7 : 1); car++)
    data.vehicles.push({
      id: uuid(100 + index * 10 + car),
      customerId: uuid(index),
      make: 'VOLKSWAGEN',
      model: 'Passat Alltrack',
      year: 2020,
      plate: 'TEST1234',
      vin: `WVWZZZ1JZXW${String(index * 10 + car).padStart(6, '0')}`,
      createdAt: '2026-10-30T12:00:00Z'
    });
  const vehicle = data.vehicles.find((entry) => entry.customerId === uuid(index))!;
  data.requests.push({
    id: uuid(500 + index),
    customerId: uuid(index),
    vehicleId: vehicle.id,
    description: longDescription,
    status: index < 3 ? 'converted' : 'scheduled',
    createdAt: '2026-10-30T12:00:00Z',
    plannedIntakeDate: '2026-10-30',
    plannedDeliveryDate: '2026-11-10'
  });
  data.orders.push({
    id: uuid(700 + index),
    number: index,
    requestId: index < 3 ? uuid(500 + index) : null,
    customerId: uuid(index),
    vehicleId: vehicle.id,
    description: longDescription,
    createdAt: '2026-10-30T12:00:00Z',
    status: 'in_progress',
    plannedIntakeDate: '2026-10-30',
    plannedDeliveryDate: '2026-11-10',
    actualIntakeDate: '2026-10-31',
    actualReadyDate: null,
    actualDeliveryDate: null,
    items: Array.from({ length: 12 }, (_, item) => ({
      description: `Підготовка та фарбування деталі ${item + 1}`,
      quantity: 1,
      unitPriceCents: 500000
    })),
    totalCents: 6000000
  });
}
if (location.pathname.endsWith('/kanban')) {
  data.customers[0].name = 'НадзвичайноДовгеПрізвищеБезПробілів'.repeat(5);
  data.vehicles[0].model = 'ДужеДовгаНазваМоделіБезПробілів'.repeat(3).slice(0, 80);
  data.orders[0].description = 'РоботаБезПробілів'.repeat(35);
  for (let index = 2; index < data.requests.length; index++) {
    data.requests[index].status = index % 2 ? 'scheduled' : 'backlog';
    if (data.requests[index].status === 'backlog') data.requests[index].plannedIntakeDate = null;
  }
  for (let index = 0; index < data.orders.length; index++) {
    data.orders[index].status = (['in_progress', 'ready', 'created'] as const)[index % 3];
    if (data.orders[index].status === 'ready') data.orders[index].actualReadyDate = '2026-10-31';
    if (data.orders[index].status === 'created') data.orders[index].actualIntakeDate = null;
  }
}
if (
  location.pathname.endsWith('/overview') ||
  new URLSearchParams(location.search).has('overviewMetric')
) {
  data.orders[1].status = 'ready';
  data.orders[1].actualReadyDate = '2026-10-31';
  data.orders[2].status = 'ready';
  data.orders[2].actualReadyDate = '2026-10-30';
  data.orders[2].actualDeliveryDate = '2026-10-31';
  data.requests[2].plannedIntakeDate = '2026-10-31';
  data.requests[3].plannedIntakeDate = '2026-11-02';
  data.orders[0].plannedDeliveryDate = '2026-11-03';
  data.orders[1].plannedDeliveryDate = '2026-11-01';
  for (let month = 0; month < 6; month++) {
    data.requests[month].createdAt = `2026-${String(5 + month).padStart(2, '0')}-10T12:00:00Z`;
    data.orders[month].createdAt = `2026-${String(5 + month).padStart(2, '0')}-10T12:00:00Z`;
  }
}
let initializedCreatedDemo = false;
let initializedEconomicsDemo = false;
let initializedFinanceDemo = false;
if (new URLSearchParams(location.search).has('flowDemo')) {
  const saved = sessionStorage.getItem('workshop-flow');
  if (saved) {
    Object.assign(data, JSON.parse(saved));
    initializedEconomicsDemo = true;
    initializedFinanceDemo = true;
  }
  data.finance ??= {
    defaultShareBps: 6000,
    settingsRevision: 0,
    inventoryRevision: '0'.repeat(64),
    postings: [],
    events: []
  };
}
export async function saveOrderEconomics(input: SaveEconomicsInput) {
  const workspace = await getWorkspace();
  const order = data.orders.find((entry) => entry.id === input.orderId);
  if (!order || input.orgId !== workspace.access?.orgId || workspace.access.role !== 'admin')
    return { ok: false as const, error: 'Доступ заборонено' };
  if ((order.workflowRevision ?? 0) !== input.expectedRevision)
    return { ok: false as const, error: 'Замовлення вже змінено' };
  order.economics = {
    ...input.details,
    painterName:
      workspace.team?.find((member) => member.id === input.details.painterId)?.name ?? '',
    polisherName:
      workspace.team?.find((member) => member.id === input.details.polisherId)?.name ?? '',
    assemblerName:
      workspace.team?.find((member) => member.id === input.details.assemblerId)?.name ?? ''
  };
  order.items = detailedCheckItems(input.details);
  order.totalCents = order.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0
  );
  order.workflowRevision = (order.workflowRevision ?? 0) + 1;
  persistFlowFixture();
  return { ok: true as const, data: undefined };
}
export async function getWorkspace() {
  if (new URLSearchParams(location.search).has('financeDemo') && !initializedFinanceDemo) {
    initializedFinanceDemo = true;
    const order = data.orders[0];
    order.economics = {
      employeeShareBps: 6000,
      painterId: 'user_worker',
      polisherId: 'user_owner',
      assemblerId: '',
      painterName: 'Маляр Андрій',
      polisherName: 'Олена Адміністратор',
      lines: [
        {
          id: uuid(920),
          kind: 'painting',
          description: 'Бампер',
          quantity: 1,
          unitPriceCents: 1800000,
          polishingCents: 100000,
          subcontractCostCents: 0,
          contractorName: ''
        }
      ]
    };
    order.items = detailedCheckItems(order.economics);
    order.totalCents = 1800000;
    order.status = 'ready';
    order.workflowRevision = 0;
    const costs = {
      paintingCents: 300000,
      polishingCents: 50000,
      unallocatedCents: 0,
      totalCents: 350000
    };
    const result = previewDetailedEconomics(order.economics, costs).result!;
    const allocations = [
      {
        payee: { kind: 'worker' as const, id: 'user_worker', name: 'Маляр Андрій' },
        amountCents: result.painterAccrualCents
      },
      {
        payee: { kind: 'worker' as const, id: 'user_owner', name: 'Олена Адміністратор' },
        amountCents: result.polisherAccrualCents
      }
    ];
    data.finance = {
      defaultShareBps: 6000,
      settingsRevision: 0,
      inventoryRevision: '0'.repeat(64),
      postings: [
        {
          id: uuid(921),
          operationId: 'initial',
          orderId: order.id,
          revision: 1,
          kind: 'initial',
          details: order.economics,
          costs,
          result,
          allocations,
          note: 'Готовність авто',
          actor: { id: 'user_owner', name: 'Олена' },
          createdAt: new Date().toISOString()
        }
      ],
      events: allocations.map((entry, index) => ({
        id: uuid(922 + index),
        orderId: order.id,
        payee: entry.payee,
        kind: 'accrual',
        amountCents: entry.amountCents,
        postingId: uuid(921),
        reversalOf: null,
        note: 'Готовність авто',
        actor: { id: 'user_owner', name: 'Олена' },
        createdAt: new Date().toISOString()
      }))
    };
    data.payments = [
      {
        id: uuid(925),
        operationId: uuid(926),
        orderId: order.id,
        kind: 'payment',
        amountCents: 1800000,
        reversalOf: null,
        note: '',
        actor: { id: 'user_owner', name: 'Олена' },
        createdAt: new Date().toISOString()
      }
    ];
  }
  if (new URLSearchParams(location.search).has('economicsDemo') && !initializedEconomicsDemo) {
    initializedEconomicsDemo = true;
    data.orders[0].items = [{ description: 'Бампер', quantity: 1, unitPriceCents: 1800000 }];
    data.orders[0].totalCents = 1800000;
  }
  if (new URLSearchParams(location.search).has('createdDemo') && !initializedCreatedDemo) {
    initializedCreatedDemo = true;
    data.orders[0].status = 'created';
    data.orders[0].actualIntakeDate = null;
  }
  if (new URLSearchParams(location.search).has('empty'))
    return {
      customers: [],
      vehicles: [],
      orders: [],
      requests: [],
      events: [],
      access: { userId: 'user_worker', orgId: 'org_test', role: 'admin' as const },
      team: []
    };
  data.expenseNames ??= structuredClone(defaultExpenseNames);
  const result = structuredClone(data);
  if (new URLSearchParams(location.search).has('trendDemo')) {
    for (const order of result.orders) {
      order.createdAt = '2026-11-01T10:00:00Z';
      order.status = 'in_progress';
      order.actualIntakeDate = '2026-11-01';
      order.actualReadyDate = null;
      order.actualDeliveryDate = null;
    }
    Object.assign(result.orders[0], {
      createdAt: '2026-09-01T10:00:00Z',
      status: 'ready',
      actualIntakeDate: '2026-09-01',
      actualReadyDate: '2026-09-09',
      actualDeliveryDate: '2026-09-10'
    });
    result.payments = [
      {
        id: uuid(995),
        operationId: uuid(995),
        orderId: result.orders[0].id,
        kind: 'payment',
        amountCents: 1000000,
        reversalOf: null,
        note: '',
        createdAt: '2026-10-05T10:00:00Z',
        actor: { id: 'admin', name: 'Адмін' }
      },
      {
        id: uuid(996),
        operationId: uuid(996),
        orderId: result.orders[0].id,
        kind: 'payment',
        amountCents: 500000,
        reversalOf: null,
        note: '',
        createdAt: '2026-11-02T10:00:00Z',
        actor: { id: 'admin', name: 'Адмін' }
      },
      {
        id: uuid(997),
        operationId: uuid(997),
        orderId: result.orders[0].id,
        kind: 'payment',
        amountCents: 1500000,
        reversalOf: null,
        note: '',
        createdAt: '2026-11-10T10:00:00Z',
        actor: { id: 'admin', name: 'Адмін' }
      }
    ];
  }
  if (new URLSearchParams(location.search).has('paymentDemo')) {
    for (const order of result.orders) {
      order.status = 'in_progress';
      order.actualReadyDate = null;
      order.actualDeliveryDate = null;
    }
    result.orders[0].actualReadyDate = businessToday();
    result.orders[0].status = 'ready';
    result.orders[0].actualDeliveryDate = businessToday();
    result.payments = [
      {
        id: uuid(990),
        operationId: uuid(991),
        orderId: result.orders[0].id,
        kind: 'payment',
        amountCents: 1000000,
        reversalOf: null,
        note: '',
        createdAt: new Date().toISOString(),
        actor: { id: 'user_owner', name: 'Олена' }
      }
    ];
  }
  if (new URLSearchParams(location.search).has('orderStatuses')) {
    result.orders[1].status = 'ready';
    result.orders[2].status = 'ready';
  }
  if (new URLSearchParams(location.search).has('brandAvatars')) {
    result.vehicles[0].make = 'ZEEKR';
    result.vehicles[1].make = 'Mercedes Benz';
    result.vehicles[2].make = 'Unknown brand';
  }
  if (new URLSearchParams(location.search).has('customerDates')) {
    result.customers[0].createdAt = '2025-01-01T00:00:00Z';
    result.customers[1].createdAt = '2026-11-01T00:00:00Z';
  }
  if (new URLSearchParams(location.search).has('largeBoard')) {
    const customer = result.customers[0];
    const vehicle = result.vehicles[0];
    const order = result.orders[0];
    const request = result.requests[0];
    result.customers = Array.from({ length: 300 }, (_, index) => ({
      ...customer,
      id: uuid(10000 + index),
      name: `Масштаб клієнт ${index + 1}`
    }));
    result.vehicles = Array.from({ length: 500 }, (_, index) => ({
      ...vehicle,
      id: uuid(20000 + index),
      customerId: result.customers[index % 300].id,
      model: 'Passat',
      vin: `WVWZZZ1JZXW${String(index).padStart(6, '0')}`
    }));
    result.orders = Array.from({ length: 1000 }, (_, index) => ({
      ...order,
      id: uuid(30000 + index),
      number: index + 1,
      requestId: null,
      vehicleId: result.vehicles[index % 500].id,
      customerId: result.vehicles[index % 500].customerId!,
      status: (['created', 'in_progress', 'ready'] as const)[index % 3],
      description: index === 999 ? 'Ремонт RareNeedle' : `Ремонт кузова ${index + 1}`
    }));
    result.requests = Array.from({ length: 200 }, (_, index) => ({
      ...request,
      id: uuid(40000 + index),
      vehicleId: result.vehicles[index].id,
      customerId: result.vehicles[index].customerId!,
      status: index % 2 ? ('scheduled' as const) : ('backlog' as const),
      description: `Ремонт за заявкою ${index + 1}`
    }));
  }
  result.access = {
    userId: 'user_worker',
    orgId: 'org_test',
    role: new URLSearchParams(location.search).get('role') === 'worker' ? 'worker' : 'admin'
  };
  result.team = [
    {
      id: 'user_owner',
      name: 'Олена Адміністратор',
      identifier: 'owner@example.com',
      role: 'admin'
    },
    { id: 'user_worker', name: 'Маляр Андрій', identifier: 'worker@example.com', role: 'worker' }
  ];
  const memberSettings = JSON.parse(sessionStorage.getItem('team-settings') ?? '{}') as Record<
    string,
    unknown
  >;
  result.team = result.team.map((member) => ({
    ...member,
    ...(readSubcontractPayroll(memberSettings[member.id])
      ? { includeSubcontractInPayroll: true }
      : {}),
    specialties: readWorkerSpecialties(memberSettings[member.id])
  }));
  const movements = (await getInventory()).movements;
  result.orders = result.orders
    .filter((order) => !order.deletedAt)
    .map((order) => ({
      trashBlockedReason: data.payments?.some((entry) => entry.orderId === order.id)
        ? 'Є оплати клієнта або їх скасування.'
        : data.finance?.postings.some((entry) => entry.orderId === order.id)
          ? 'Є проведений розрахунок зарплати.'
          : movements.some((entry) => entry.orderId === order.id)
            ? 'Є складські операції за замовленням.'
            : order.expenses?.length
              ? 'Є записи витрат на субпідряд.'
              : null,
      ...order,
      assigneeId: order.assigneeId ?? 'user_owner',
      assigneeName: order.assigneeName ?? 'Олена Адміністратор'
    }));
  if (result.finance && result.access.role === 'worker')
    result.finance.events = result.finance.events.filter(
      (entry) => entry.payee.kind === 'worker' && entry.payee.id === result.access!.userId
    );
  return result;
}
const localModels: { make: string; model: string }[] = [];
export async function addVehicleModel(input: { make: string; model: string }) {
  localModels.push(input);
  return { ok: true as const, data: input.model };
}
export async function getVehicleCatalog(make: string) {
  return {
    makes: ['VOLKSWAGEN', 'BMW', 'FORD'],
    models: [
      ...(make === 'BMW' ? ['X3', 'X5'] : ['Passat Alltrack', 'Golf']),
      ...localModels.filter((entry) => entry.make === make).map((entry) => entry.model)
    ],
    warning: null
  };
}
export async function decodeVehicleVin() {
  return { make: 'BMW', model: 'X3', year: 2020, message: '' };
}
export async function createCustomer(input: CustomerInput) {
  const id = crypto.randomUUID();
  const contacts = (input.contacts ?? [{ type: 'phone' as const, value: input.phone ?? '' }]).map(
    (contact) => ({ ...contact, id: crypto.randomUUID() })
  );
  data.customers.push({
    name: input.name,
    notes: input.notes,
    phone: contacts.find((contact) => contact.type === 'phone')?.value ?? '',
    contacts,
    revision: 0,
    id,
    createdAt: new Date().toISOString()
  });
  return { ok: true as const, data: id };
}
export async function createVehicle(input: VehicleInput) {
  const id = crypto.randomUUID();
  data.vehicles.push({
    ...input,
    id,
    customerId: input.customerId || null,
    vin: input.vin || null
  });
  return { ok: true as const, data: id };
}
export async function updateVehicle(input: VehicleInput & { id: string }) {
  const vehicle = data.vehicles.find((entry) => entry.id === input.id);
  if (vehicle) Object.assign(vehicle, input);
  return { ok: true as const, data: null };
}
export async function createOrder(input: OrderInput) {
  const workspace = await getWorkspace();
  const id = crypto.randomUUID();
  const items = input.items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitPriceCents: Math.round(item.unitPrice * 100)
  }));
  data.orders.push({
    id,
    number: Math.max(0, ...data.orders.map((entry) => entry.number)) + 1,
    requestId: input.requestId || null,
    customerId: input.customerId,
    vehicleId: input.vehicleId,
    description: input.description,
    assigneeId: input.assigneeId,
    assigneeName: workspace.team?.find((entry) => entry.id === input.assigneeId)?.name,
    status: 'created',
    workflowRevision: 0,
    createdAt: new Date().toISOString(),
    plannedIntakeDate: input.plannedIntakeDate || null,
    plannedDeliveryDate: input.plannedDeliveryDate || null,
    actualIntakeDate: input.actualIntakeDate || null,
    actualReadyDate: null,
    actualDeliveryDate: null,
    salaryModel: 'net',
    defaultEmployeeShareBps: input.employeeShareBps ?? 6000,
    paintPlan: input.paintPlan ?? [],
    items,
    totalCents: items.reduce((total, item) => total + item.quantity * item.unitPriceCents, 0)
  });
  if (input.requestId) {
    const request = data.requests.find((entry) => entry.id === input.requestId);
    if (request) request.status = 'converted';
  }
  persistFlowFixture();
  return { ok: true as const, data: id };
}
export async function createRequest() {
  return { ok: true as const, data: crypto.randomUUID() };
}
export async function updateOrder(input: UpdateOrderInput) {
  const workspace = await getWorkspace();
  const order = data.orders.find((entry) => entry.id === input.id)!;
  if ((order.workflowRevision ?? 0) !== (input.expectedRevision ?? 0))
    return { ok: false as const, error: 'Запис уже змінено в іншому вікні' };
  order.description = input.description;
  order.items = input.items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitPriceCents: Math.round(item.unitPrice * 100)
  }));
  order.totalCents = order.items.reduce(
    (total, item) => total + item.quantity * item.unitPriceCents,
    0
  );
  order.paintPlan = input.paintPlan ?? order.paintPlan;
  if (input.assigneeId) {
    order.assigneeId = input.assigneeId;
    order.assigneeName = workspace.team?.find((entry) => entry.id === input.assigneeId)?.name;
  }
  order.defaultEmployeeShareBps = input.employeeShareBps ?? order.defaultEmployeeShareBps ?? 6000;
  order.salaryModel = 'net';
  order.workflowRevision = (order.workflowRevision ?? 0) + 1;
  await syncNetFixture(order);
  persistFlowFixture();
  return { ok: true as const, data: null };
}
export async function updateWorkflow() {
  return { ok: true as const, data: null };
}
export async function updateVehicleVin() {
  return { ok: true as const, data: null };
}
export async function assignVehicle() {
  return { ok: true as const, data: null };
}
export async function deleteVehicle(id: Vehicle['id']) {
  data.vehicles = data.vehicles.filter((entry) => entry.id !== id);
  return { ok: true as const, data: null };
}

export async function getTeam() {
  const workspace = await getWorkspace();
  return { access: workspace.access!, team: workspace.team ?? ([] as TeamMember[]) };
}
export async function updateTeamMember(input: UpdateTeamMemberInput) {
  const workspace = await getWorkspace();
  if (
    workspace.access?.role !== 'admin' ||
    input.orgId !== workspace.access.orgId ||
    !workspace.team?.some((member) => member.id === input.userId)
  )
    return { ok: false as const, error: 'Немає доступу' };
  const value = updateTeamMemberSchema.parse(input);
  const settings = JSON.parse(sessionStorage.getItem('team-settings') ?? '{}');
  settings[value.userId] = {
    crm: {
      specialties: value.specialties,
      includeSubcontractInPayroll: value.includeSubcontractInPayroll ?? false
    }
  };
  sessionStorage.setItem('team-settings', JSON.stringify(settings));
  return { ok: true as const, data: value.specialties };
}
export async function advanceOrder(input: AdvanceOrderInput) {
  const order = data.orders.find((order) => order.id === input.id);
  if (!order) return { ok: false as const, error: 'Замовлення не знайдено' };
  const next = executorTransition(order, input);
  if (!next.ok) return next;
  Object.assign(order, {
    status: next.data.status,
    actualIntakeDate: next.data.actualIntakeDate || null,
    actualReadyDate: next.data.actualReadyDate || null,
    actualDeliveryDate: next.data.actualDeliveryDate || null,
    workflowRevision: (order.workflowRevision ?? 0) + 1
  });
  order.salaryModel = 'net';
  await syncNetFixture(order);
  persistFlowFixture();
  return { ok: true as const, data: null };
}

export async function receivePayment(
  orgId: string,
  input: { orderId: string; operationId: string; amount: string; note: string }
) {
  if (orgId !== 'org_test') return { ok: false as const, error: 'Автомалярку змінено' };
  const order = data.orders.find((entry) => entry.id === input.orderId)!;
  data.payments ??= [];
  const paid = data.payments
    .filter((entry) => entry.orderId === order.id)
    .reduce((sum, entry) => sum + paymentDelta(entry), 0);
  const amountCents = Math.round(Number(input.amount.replace(',', '.')) * 100);
  if (amountCents + paid > order.totalCents)
    return { ok: false as const, error: 'Оплата перевищує залишок до сплати' };
  const id = crypto.randomUUID();
  data.payments.push({
    id,
    operationId: input.operationId,
    orderId: input.orderId,
    kind: 'payment',
    amountCents,
    reversalOf: null,
    note: input.note,
    createdAt: new Date().toISOString(),
    actor: { id: 'user_owner', name: 'Олена Адміністратор' }
  });
  return { ok: true as const, data: id };
}
export async function reversePayment(
  _orgId: string,
  input: { paymentId: string; operationId: string; note: string }
) {
  const original = data.payments!.find((entry) => entry.id === input.paymentId)!;
  const id = crypto.randomUUID();
  data.payments!.push({
    ...original,
    id,
    operationId: input.operationId,
    kind: original.kind === 'refund' ? 'refund_reversal' : 'reversal',
    reversalOf: original.id,
    note: input.note,
    createdAt: new Date().toISOString()
  });
  return { ok: true as const, data: id };
}

export async function updateCustomer(input: UpdateCustomerInput & { orgId: string }) {
  const customer = data.customers.find((entry) => entry.id === input.id);
  if (!customer || input.orgId !== 'org_test')
    return { ok: false as const, error: 'Клієнта не знайдено' };
  if ((customer.revision ?? 0) !== input.expectedRevision)
    return { ok: false as const, error: 'Клієнта вже змінено в іншому вікні' };
  const contacts = (input.contacts ?? [{ type: 'phone' as const, value: input.phone ?? '' }]).map(
    (contact) => ({ ...contact, id: crypto.randomUUID() })
  );
  Object.assign(customer, {
    name: input.name,
    notes: input.notes,
    contacts,
    phone: contacts.find((contact) => contact.type === 'phone')?.value ?? '',
    revision: (customer.revision ?? 0) + 1
  });
  return { ok: true as const, data: null };
}

export async function getOrderTrash(_orgId: string) {
  const workspace = await getWorkspace();
  return { ...workspace, orders: structuredClone(data.orders.filter((order) => order.deletedAt)) };
}
export async function changeOrderTrash(input: OrderTrashInput) {
  const workspace = await getWorkspace();
  if (workspace.access?.role !== 'admin' || input.orgId !== workspace.access.orgId)
    return { ok: false as const, error: 'Немає доступу' };
  const order = data.orders.find((entry) => entry.id === input.orderId);
  if (!order) return { ok: false as const, error: 'Замовлення не знайдено' };
  if ((order.workflowRevision ?? 0) !== input.expectedRevision)
    return { ok: false as const, error: 'Замовлення вже змінено.' };
  const visible = workspace.orders.find((entry) => entry.id === order.id);
  if (input.action === 'trash' && visible?.trashBlockedReason)
    return { ok: false as const, error: visible.trashBlockedReason };
  if (input.action === 'delete') {
    if (!order.deletedAt)
      return { ok: false as const, error: 'Остаточне видалення доступне лише з кошика.' };
    data.orders = data.orders.filter((entry) => entry.id !== order.id);
    data.events = data.events.filter(
      (entry) => entry.kind !== 'order' || entry.recordId !== order.id
    );
    persistFlowFixture();
    return { ok: true as const, data: null };
  }
  order.deletedAt = input.action === 'trash' ? new Date().toISOString() : null;
  order.deletedBy =
    input.action === 'trash' ? { id: 'user_owner', name: 'Олена Адміністратор' } : null;
  order.workflowRevision = (order.workflowRevision ?? 0) + 1;
  persistFlowFixture();
  return { ok: true as const, data: null };
}
