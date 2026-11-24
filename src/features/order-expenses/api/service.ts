'use server';

import { z } from 'zod';
import { getOrganizationContext } from '@/features/crm/server/organization';
import type { ActionResult } from '@/features/crm/api/types';
import { EconomicsError } from '@/features/order-economics/lib/integers';
import {
  orderExpenseSchema,
  createExpenseNameSchema,
  type CreateExpenseNameInput
} from '../schemas/expenses';
import type { OrderExpenseName } from './types';
import type { OrderExpenseInput, RemoveOrderExpenseInput } from '../schemas/expenses';

async function write(
  input: OrderExpenseInput | RemoveOrderExpenseInput,
  remove: boolean
): Promise<ActionResult<string>> {
  try {
    const context = await getOrganizationContext();
    if (context.access.orgId !== input.orgId)
      throw new EconomicsError('Автомалярку змінено. Оновіть сторінку.');
    if (context.access.role !== 'admin')
      throw new EconomicsError('Змінювати витрати може лише адміністратор.');
    const actor = {
      id: context.access.userId,
      name: context.team.find((member) => member.id === context.access.userId)!.name
    };
    let member: { id: string; name: string } | undefined;
    if (!remove) {
      const value = orderExpenseSchema.parse(input);
      const active = context.team.find((entry) => entry.id === value.contractorUserId);
      member = active ? { id: active.id, name: active.name } : undefined;
      if (!member && value.id) {
        const prior = context.repository.expenses
          .list(value.orderId)
          .find(
            (entry) => entry.id === value.id && entry.contractorUserId === value.contractorUserId
          );
        if (prior) member = { id: value.contractorUserId, name: prior.contractorName };
      }
      if (!member) throw new EconomicsError('Виберіть субпідрядника з команди цієї автомалярки.');
    }
    return { ok: true, data: context.repository.expenses.save(input, actor, remove, member) };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { ok: false, error: error.issues[0]?.message ?? 'Перевірте витрату' };
    if (error instanceof EconomicsError) return { ok: false, error: error.message };
    return { ok: false, error: 'Не вдалося зберегти витрату. Повторіть спробу.' };
  }
}
export async function saveOrderExpense(input: OrderExpenseInput): Promise<ActionResult<string>> {
  return write(input, false);
}
export async function removeOrderExpense(
  input: RemoveOrderExpenseInput
): Promise<ActionResult<string>> {
  return write(input, true);
}

export async function createExpenseName(
  input: CreateExpenseNameInput
): Promise<ActionResult<OrderExpenseName>> {
  try {
    const context = await getOrganizationContext();
    if (context.access.role !== 'admin')
      throw new EconomicsError('Додавати назви може лише адміністратор.');
    const value = createExpenseNameSchema.parse(input);
    if (value.orgId !== context.access.orgId)
      throw new EconomicsError('Автомалярку змінено. Оновіть сторінку.');
    return { ok: true, data: context.repository.expenses.createName(value.name) };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { ok: false, error: error.issues[0]?.message ?? 'Перевірте назву' };
    if (error instanceof EconomicsError) return { ok: false, error: error.message };
    return { ok: false, error: 'Не вдалося додати назву витрати. Повторіть спробу.' };
  }
}
