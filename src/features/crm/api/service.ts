'use server';

import { getOrganizationContext } from '../server/organization';
import { z } from 'zod';
import { executorTransition } from '../lib/executor-workflow';
import { PaymentError } from '../server/payments';
import {
  paymentSchema,
  reversePaymentSchema,
  type PaymentInput,
  type ReversePaymentInput
} from '../schemas/payment';
import { CrmError } from '../server/repository';
import {
  customerSchema,
  updateCustomerSchema,
  vehicleSchema,
  requestSchema,
  orderSchema,
  updateOrderSchema,
  updateVinSchema,
  workflowSchema,
  advanceOrderSchema
} from '../schemas/crm';
import type {
  CustomerInput,
  UpdateCustomerInput,
  VehicleInput,
  RequestInput,
  OrderInput,
  UpdateOrderInput,
  WorkflowInput,
  AdvanceOrderInput
} from '../schemas/crm';
import type { ActionResult, CrmWorkspace, OrderDocument } from './types';
import { readCatalog, readVin } from '../server/vehicle-catalog';
import { vehicleModelSchema, type VehicleModelInput } from '../schemas/vehicle-model';

function uniqueCatalogNames(values: string[]): string[] {
  return [...new Map(values.map((value) => [value.toUpperCase(), value])).values()].toSorted();
}

export async function getVehicleCatalog(
  make: string,
  expectedOrgId?: string
): Promise<Awaited<ReturnType<typeof readCatalog>>> {
  const repository = await authorizedRepository(expectedOrgId);
  const normalized = z.string().trim().max(80).parse(make).toUpperCase();
  const catalog = await readCatalog(normalized);
  const local = repository.vehicleModels();
  return {
    ...catalog,
    makes: uniqueCatalogNames([...catalog.makes, ...local.map((entry) => entry.make)]),
    models: uniqueCatalogNames([
      ...catalog.models,
      ...local.filter((entry) => entry.make === normalized).map((entry) => entry.model)
    ])
  };
}

export async function addVehicleModel(
  input: VehicleModelInput & { orgId?: string }
): Promise<ActionResult<string>> {
  return write((repository, context) => {
    if (input.orgId && input.orgId !== context.access.orgId)
      throw new CrmError('Автомалярку змінено. Оновіть сторінку.');
    return repository.addVehicleModel(vehicleModelSchema.parse(input));
  });
}

export async function decodeVehicleVin(
  vin: string,
  year?: number
): Promise<Awaited<ReturnType<typeof readVin>>> {
  await authorizedRepository();
  return readVin(vin, year);
}

async function authorizedRepository(expectedOrgId?: string) {
  const { repository, access } = await getOrganizationContext();
  if (expectedOrgId && expectedOrgId !== access.orgId)
    throw new CrmError('Автомалярку змінено. Оновіть сторінку.');
  if (access.role !== 'admin')
    throw new CrmError('Ця дія доступна лише адміністратору автомалярки');
  return repository;
}

type CrmContext = Awaited<ReturnType<typeof getOrganizationContext>>;
function historyActor(context: CrmContext) {
  return {
    id: context.access.userId,
    name: context.team.find((member) => member.id === context.access.userId)!.name
  };
}
async function write<T>(
  operation: (repository: CrmContext['repository'], context: CrmContext) => T,
  permission: 'admin' | 'read' = 'admin'
): Promise<ActionResult<T>> {
  try {
    const context = await getOrganizationContext();
    if (permission === 'admin' && context.access.role !== 'admin')
      throw new CrmError('Ця дія доступна лише адміністратору автомалярки');
    return { ok: true, data: operation(context.repository, context) };
  } catch (error) {
    if (error instanceof z.ZodError)
      return {
        ok: false,
        error: error.issues[0]?.message ?? 'Перевірте введені дані'
      };
    if (error instanceof CrmError || error instanceof PaymentError)
      return { ok: false, error: error.message };
    return {
      ok: false,
      error: 'Не вдалося виконати дію. Перевірте підключення та повторіть.'
    };
  }
}

export async function getWorkspace(expectedOrgId?: string | null): Promise<CrmWorkspace> {
  const { repository, access, team } = await getOrganizationContext();
  if (expectedOrgId && expectedOrgId !== access.orgId)
    throw new CrmError('Автомалярку змінено. Оновіть сторінку.');
  return { ...repository.workspace(), access, team };
}

export async function checkCrmAccess(): Promise<ActionResult<null>> {
  return write(() => null, 'read');
}

export async function assignVehicle(input: {
  id: string;
  customerId: string;
}): Promise<ActionResult<null>> {
  return write((repository) => {
    const value = z.object({ id: z.uuid(), customerId: z.uuid() }).parse(input);
    repository.assignVehicle(value.id, value.customerId);
    return null;
  });
}

export async function updateWorkflow(input: WorkflowInput): Promise<ActionResult<null>> {
  return write((repository, context) => {
    repository.updateWorkflow(workflowSchema.parse(input), historyActor(context));
    return null;
  });
}

export async function advanceOrder(input: AdvanceOrderInput): Promise<ActionResult<null>> {
  return write((repository, context) => {
    const value = advanceOrderSchema.parse(input);
    const order = repository.workspace().orders.find((order) => order.id === value.id);
    if (!order) throw new CrmError('Замовлення не знайдено');
    const transition = executorTransition(order, value);
    if (!transition.ok) throw new CrmError(transition.error);
    repository.updateWorkflow(transition.data, historyActor(context));
    return null;
  }, 'read');
}

export async function createCustomer(
  input: CustomerInput & { orgId?: string }
): Promise<ActionResult<string>> {
  return write((repository, context) => {
    if (input.orgId && input.orgId !== context.access.orgId)
      throw new CrmError('Автомалярку змінено. Оновіть сторінку.');
    return repository.createCustomer(customerSchema.parse(input));
  });
}

export async function createVehicle(input: VehicleInput): Promise<ActionResult<string>> {
  return write((repository) => repository.createVehicle(vehicleSchema.parse(input)));
}

export async function updateVehicle(
  input: VehicleInput & { id: string }
): Promise<ActionResult<null>> {
  return write((repository) => {
    const id = z.uuid().parse(input.id);
    repository.updateVehicle(id, vehicleSchema.parse(input));
    return null;
  });
}

export async function deleteVehicle(id: string): Promise<ActionResult<null>> {
  return write((repository) => {
    repository.deleteVehicle(z.uuid().parse(id));
    return null;
  });
}

export async function createRequest(input: RequestInput): Promise<ActionResult<string>> {
  return write((repository, context) =>
    repository.createRequest(requestSchema.parse(input), historyActor(context))
  );
}

export async function createOrder(input: OrderInput): Promise<ActionResult<string>> {
  return write((repository, context) => {
    const value = orderSchema.parse(input);
    const assignee = context.team.find((member) => member.id === value.assigneeId);
    if (!assignee) throw new CrmError('Виберіть активного учасника цієї автомалярки як виконавця');
    return repository.createOrder(value, assignee.name, historyActor(context));
  });
}

export async function updateOrder(input: UpdateOrderInput): Promise<ActionResult<null>> {
  return write((repository, context) => {
    const value = updateOrderSchema.parse(input);
    const current = repository.workspace().orders.find((order) => order.id === value.id);
    if (!current) throw new CrmError('Замовлення не знайдено');
    if (value.assigneeId === undefined || value.assigneeId === current.assigneeId) {
      repository.updateOrder({ ...value, assigneeId: undefined }, undefined, historyActor(context));
    } else {
      const assignee = context.team.find((member) => member.id === value.assigneeId);
      if (!assignee)
        throw new CrmError('Виберіть активного учасника цієї автомалярки як виконавця');
      repository.updateOrder(value, assignee.name, historyActor(context));
    }
    return null;
  });
}

export async function updateVehicleVin(input: {
  id: string;
  vin: string;
}): Promise<ActionResult<null>> {
  return write((repository) => {
    const value = updateVinSchema.parse(input);
    repository.updateVin(value.id, value.vin);
    return null;
  });
}

export async function getOrderDocument(id: string): Promise<OrderDocument | null> {
  const workspace = await getWorkspace();
  const order = workspace.orders.find((order) => order.id === id);
  if (!order) return null;
  const customer = workspace.customers.find((customer) => customer.id === order.customerId);
  const vehicle = workspace.vehicles.find((vehicle) => vehicle.id === order.vehicleId);
  return customer && vehicle ? { order, customer, vehicle } : null;
}

export async function getTeam(expectedOrgId?: string | null) {
  const { access, team } = await getOrganizationContext();
  if (expectedOrgId && expectedOrgId !== access.orgId)
    throw new CrmError('Автомалярку змінено. Оновіть сторінку.');
  return { access, team };
}

export async function receivePayment(
  orgId: string,
  input: PaymentInput
): Promise<ActionResult<string>> {
  return write((repository, context) => {
    if (context.access.orgId !== orgId)
      throw new CrmError('Автомалярку змінено. Оновіть сторінку.');
    return repository.payments.receive(paymentSchema.parse(input), historyActor(context));
  });
}
export async function reversePayment(
  orgId: string,
  input: ReversePaymentInput
): Promise<ActionResult<string>> {
  return write((repository, context) => {
    if (context.access.orgId !== orgId)
      throw new CrmError('Автомалярку змінено. Оновіть сторінку.');
    return repository.payments.reverse(reversePaymentSchema.parse(input), historyActor(context));
  });
}

export async function updateCustomer(
  input: UpdateCustomerInput & { orgId: string }
): Promise<ActionResult<null>> {
  return write((repository, context) => {
    if (input.orgId !== context.access.orgId)
      throw new CrmError('Автомалярку змінено. Оновіть сторінку.');
    repository.updateCustomer(updateCustomerSchema.parse(input));
    return null;
  });
}
