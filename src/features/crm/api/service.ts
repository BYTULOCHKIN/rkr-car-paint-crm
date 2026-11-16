'use server';

import { getCrmContext } from '../server/organization';
import { z } from 'zod';
import { CrmError } from '../server/repository';
import {
  customerSchema,
  vehicleSchema,
  requestSchema,
  orderSchema,
  updateOrderSchema,
  updateVinSchema,
  workflowSchema
} from '../schemas/crm';
import type {
  CustomerInput,
  VehicleInput,
  RequestInput,
  OrderInput,
  UpdateOrderInput,
  WorkflowInput
} from '../schemas/crm';
import type { ActionResult, CrmWorkspace, OrderDocument } from './types';
import { readCatalog, readVin } from '../server/vehicle-catalog';

export async function getVehicleCatalog(
  make: string
): Promise<Awaited<ReturnType<typeof readCatalog>>> {
  await authorizedRepository();
  return readCatalog(z.string().max(80).parse(make));
}

export async function decodeVehicleVin(
  vin: string,
  year?: number
): Promise<Awaited<ReturnType<typeof readVin>>> {
  await authorizedRepository();
  return readVin(vin, year);
}

async function authorizedRepository() {
  const { repository, access } = await getCrmContext();
  if (access.role !== 'admin')
    throw new CrmError('Ця дія доступна лише адміністратору автомалярки');
  return repository;
}

type CrmContext = Awaited<ReturnType<typeof getCrmContext>>;
async function write<T>(
  operation: (repository: CrmContext['repository'], context: CrmContext) => T,
  permission: 'admin' | 'read' = 'admin'
): Promise<ActionResult<T>> {
  try {
    const context = await getCrmContext();
    if (permission === 'admin' && context.access.role !== 'admin')
      throw new CrmError('Ця дія доступна лише адміністратору автомалярки');
    return { ok: true, data: operation(context.repository, context) };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { ok: false, error: error.issues[0]?.message ?? 'Перевірте введені дані' };
    if (error instanceof CrmError) return { ok: false, error: error.message };
    return { ok: false, error: 'Не вдалося виконати дію. Перевірте підключення та повторіть.' };
  }
}

export async function getWorkspace(): Promise<CrmWorkspace> {
  const { repository, access, team } = await getCrmContext();
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
    const value = workflowSchema.parse(input);
    if (context.access.role !== 'admin') {
      if (value.kind !== 'order')
        throw new CrmError('Виконавець може змінювати лише статуси замовлень');
      const order = repository.workspace().orders.find((order) => order.id === value.id);
      if (!order) throw new CrmError('Замовлення не знайдено');
      if (
        (order.plannedIntakeDate ?? '') !== value.plannedIntakeDate ||
        (order.plannedDeliveryDate ?? '') !== value.plannedDeliveryDate
      )
        throw new CrmError('Планові дати може змінювати лише адміністратор');
    }
    repository.updateWorkflow(value);
    return null;
  }, 'read');
}

export async function createCustomer(input: CustomerInput): Promise<ActionResult<string>> {
  return write((repository) => repository.createCustomer(customerSchema.parse(input)));
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
  return write((repository) => repository.createRequest(requestSchema.parse(input)));
}

export async function createOrder(input: OrderInput): Promise<ActionResult<string>> {
  return write((repository, context) => {
    const value = orderSchema.parse(input);
    const assignee = context.team.find((member) => member.id === value.assigneeId);
    if (!assignee) throw new CrmError('Виберіть активного учасника цієї автомалярки як виконавця');
    return repository.createOrder(value, assignee.name);
  });
}

export async function updateOrder(input: UpdateOrderInput): Promise<ActionResult<null>> {
  return write((repository, context) => {
    const value = updateOrderSchema.parse(input);
    const current = repository.workspace().orders.find((order) => order.id === value.id);
    if (!current) throw new CrmError('Замовлення не знайдено');
    const assignee = context.team.find(
      (member) => member.id === (value.assigneeId ?? current.assigneeId)
    );
    if (!assignee) throw new CrmError('Виберіть активного учасника цієї автомалярки як виконавця');
    repository.updateOrder({ ...value, assigneeId: assignee.id }, assignee.name);
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
