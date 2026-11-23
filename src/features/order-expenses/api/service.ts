'use server';

import { z } from 'zod';
import { getOrganizationContext } from '@/features/crm/server/organization';
import type { ActionResult } from '@/features/crm/api/types';
import { EconomicsError } from '@/features/order-economics/lib/integers';
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
    return { ok: true, data: context.repository.expenses.save(input, actor, remove) };
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
