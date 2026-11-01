'use server';

import { auth } from '@clerk/nextjs/server';
import { z } from 'zod';
import { CrmError, getCrmRepository } from '../server/repository';
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
import type { ActionResult, CrmWorkspace } from './types';
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
  const { userId } = await auth();
  if (!userId) throw new CrmError('Увійдіть у свій обліковий запис');
  const repository = getCrmRepository();
  repository.authorize(userId, process.env.CRM_ADMIN_USER_ID);
  return repository;
}

async function write<T>(
  operation: (repository: Awaited<ReturnType<typeof authorizedRepository>>) => T
): Promise<ActionResult<T>> {
  try {
    const repository = await authorizedRepository();
    return { ok: true, data: operation(repository) };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { ok: false, error: error.issues[0]?.message ?? 'Перевірте введені дані' };
    if (error instanceof CrmError) return { ok: false, error: error.message };
    return { ok: false, error: 'Не вдалося зберегти дані. Спробуйте ще раз.' };
  }
}

export async function getWorkspace(): Promise<CrmWorkspace> {
  return (await authorizedRepository()).workspace();
}

export async function checkCrmAccess(): Promise<ActionResult<null>> {
  return write(() => null);
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
  return write((repository) => {
    repository.updateWorkflow(workflowSchema.parse(input));
    return null;
  });
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
  return write((repository) => repository.createOrder(orderSchema.parse(input)));
}

export async function updateOrder(input: UpdateOrderInput): Promise<ActionResult<null>> {
  return write((repository) => {
    repository.updateOrder(updateOrderSchema.parse(input));
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
