import { mutationOptions } from '@tanstack/react-query';
import { saveOrderExpense, removeOrderExpense } from './service';
import type { OrderExpenseInput, RemoveOrderExpenseInput } from '../schemas/expenses';

async function unwrap<T>(result: { ok: true; data: T } | { ok: false; error: string }): Promise<T> {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
export const expenseMutations = {
  save: () =>
    mutationOptions({
      mutationFn: async (input: OrderExpenseInput) => unwrap(await saveOrderExpense(input))
    }),
  remove: () =>
    mutationOptions({
      mutationFn: async (input: RemoveOrderExpenseInput) => unwrap(await removeOrderExpense(input))
    })
};
