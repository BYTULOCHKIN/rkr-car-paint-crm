'use server';

import { z } from 'zod';
import { getOrganizationContext } from '@/features/crm/server/organization';
import { CrmError } from '@/features/crm/server/repository';
import type { ActionResult } from '@/features/crm/api/types';
import { InventoryError } from '../server/repository';
import { EconomicsError } from '@/features/order-economics/lib/integers';
import { archiveSchema } from '../schemas/inventory';
import type { EditConsumptionInput } from '../schemas/inventory';
import type {
  ItemInput,
  UpdateItemInput,
  ReceiptInput,
  AdjustmentInput,
  ConsumptionInput,
  BatchConsumptionInput,
  ReversalInput,
  ValuationInput
} from '../schemas/inventory';
import type { InventoryData } from './types';
import type { InventoryFilters, InventoryItemsResponse } from './types';

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
    if (
      error instanceof InventoryError ||
      error instanceof CrmError ||
      error instanceof EconomicsError
    )
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

export async function getInventoryAccess(orgId: string) {
  const { access } = await getOrganizationContext();
  if (access.orgId !== orgId) throw new InventoryError('Автомалярку змінено. Оновіть сторінку.');
  return { access };
}

export async function getInventoryPage(
  orgId: string,
  filters: InventoryFilters
): Promise<InventoryItemsResponse> {
  const { access, repository } = await getOrganizationContext();
  if (access.orgId !== orgId) throw new InventoryError('Автомалярку змінено. Оновіть сторінку.');
  return repository.inventory.listItems(filters);
}

export async function getOrderInventory(orgId: string, orderId: string): Promise<InventoryData> {
  const { access, repository } = await getOrganizationContext();
  if (access.orgId !== orgId) throw new InventoryError('Автомалярку змінено. Оновіть сторінку.');
  if (!repository.reads.order(orderId).orders.length)
    throw new InventoryError('Замовлення не знайдено');
  return {
    access,
    items: repository.inventory.orderItems(orderId),
    movements: repository.inventory.orderMovements(orderId)
  };
}
export async function editConsumption(
  orgId: string,
  input: EditConsumptionInput
): Promise<ActionResult<void>> {
  return write(orgId, (context) =>
    context.repository.mutateOrderCosts(input.orderId, actor(context), () =>
      context.repository.inventory.editConsumption(input, actor(context))
    )
  );
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
  return write(orgId, (context) =>
    context.repository.mutateOrderCosts(input.orderId, actor(context), () =>
      context.repository.inventory.consume(input, actor(context))
    )
  );
}
export async function reverseConsumption(
  orgId: string,
  input: ReversalInput
): Promise<ActionResult<void>> {
  return write(orgId, (context) => {
    const movement = context.repository.inventory
      .movements()
      .find((entry) => entry.id === input.movementId);
    if (!movement?.orderId) throw new InventoryError('Списання не знайдено');
    context.repository.mutateOrderCosts(movement.orderId, actor(context), () =>
      context.repository.inventory.reverse(input, actor(context))
    );
  });
}
export async function consumeStockBatch(
  orgId: string,
  input: BatchConsumptionInput
): Promise<ActionResult<void>> {
  return write(orgId, (context) =>
    context.repository.mutateOrderCosts(input.orderId, actor(context), () =>
      context.repository.inventory.consumeBatch(input, actor(context))
    )
  );
}
export async function valueStockBalance(
  orgId: string,
  input: ValuationInput
): Promise<ActionResult<void>> {
  return write(orgId, (context) =>
    context.repository.inventory.valueOpeningBalance(input, actor(context))
  );
}
