'use server';

import { z } from 'zod';
import { getOrganizationContext } from '@/features/crm/server/organization';
import { CrmError } from '@/features/crm/server/repository';
import type { ActionResult } from '@/features/crm/api/types';
import { InventoryError } from '../server/repository';
import { archiveSchema } from '../schemas/inventory';
import type {
  ItemInput,
  UpdateItemInput,
  ReceiptInput,
  AdjustmentInput,
  ConsumptionInput,
  ReversalInput
} from '../schemas/inventory';
import type { InventoryData } from './types';

type Context = Awaited<ReturnType<typeof getOrganizationContext>>;
async function write<T>(
  orgId: string,
  operation: (context: Context) => T
): Promise<ActionResult<T>> {
  try {
    const context = await getOrganizationContext();
    if (context.access.orgId !== orgId)
      throw new InventoryError('Автомалярку змінено. Оновіть сторінку.');
    if (context.access.role !== 'admin')
      throw new InventoryError('Ця дія доступна лише адміністратору');
    return { ok: true, data: operation(context) };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { ok: false, error: error.issues[0]?.message ?? 'Перевірте введені дані' };
    if (error instanceof InventoryError || error instanceof CrmError)
      return { ok: false, error: error.message };
    return { ok: false, error: 'Не вдалося зберегти складську операцію. Повторіть спробу.' };
  }
}

function actor(context: Context) {
  return {
    id: context.access.userId,
    name: context.team.find((member) => member.id === context.access.userId)!.name
  };
}

export async function getInventory(orgId: string): Promise<InventoryData> {
  const { repository, access } = await getOrganizationContext();
  if (access.orgId !== orgId) throw new InventoryError('Автомалярку змінено. Оновіть сторінку.');
  return {
    access,
    items: repository.inventory.items(),
    movements: repository.inventory.movements()
  };
}
export async function createStockItem(
  orgId: string,
  input: ItemInput
): Promise<ActionResult<string>> {
  return write(orgId, ({ repository }) => repository.inventory.createItem(input));
}
export async function updateStockItem(
  orgId: string,
  input: UpdateItemInput
): Promise<ActionResult<void>> {
  return write(orgId, ({ repository }) => repository.inventory.updateItem(input));
}
export async function archiveStockItem(
  orgId: string,
  input: { id: string; archived: boolean }
): Promise<ActionResult<void>> {
  return write(orgId, ({ repository }) => {
    const value = archiveSchema.parse(input);
    repository.inventory.archive(value.id, value.archived);
  });
}
export async function receiveStock(
  orgId: string,
  input: ReceiptInput
): Promise<ActionResult<void>> {
  return write(orgId, (context) => context.repository.inventory.receive(input, actor(context)));
}
export async function adjustStock(
  orgId: string,
  input: AdjustmentInput
): Promise<ActionResult<void>> {
  return write(orgId, (context) => context.repository.inventory.adjust(input, actor(context)));
}
export async function consumeStock(
  orgId: string,
  input: ConsumptionInput
): Promise<ActionResult<void>> {
  return write(orgId, (context) => context.repository.inventory.consume(input, actor(context)));
}
export async function reverseConsumption(
  orgId: string,
  input: ReversalInput
): Promise<ActionResult<void>> {
  return write(orgId, (context) => context.repository.inventory.reverse(input, actor(context)));
}
