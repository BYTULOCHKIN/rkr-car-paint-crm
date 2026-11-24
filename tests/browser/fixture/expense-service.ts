import { financeFixtureData, getWorkspace, persistFlowFixture } from './service';
import { syncNetFixture } from './net-salary';
import type {
  OrderExpenseInput,
  RemoveOrderExpenseInput
} from '@/features/order-expenses/schemas/expenses';
import {
  defaultExpenseNames,
  expenseNameKey,
  normalizeExpenseName
} from '@/features/order-expenses/lib/names';
import type { CreateExpenseNameInput } from '@/features/order-expenses/schemas/expenses';
import { decimalScaled } from '@/features/inventory/schemas/inventory';
export async function saveOrderExpense(input: OrderExpenseInput) {
  const workspace = await getWorkspace();
  const order = financeFixtureData().orders.find((entry) => entry.id === input.orderId)!;
  if (
    workspace.access?.role !== 'admin' ||
    (order.workflowRevision ?? 0) !== input.expectedRevision
  )
    return { ok: false as const, error: 'Замовлення змінилося' };
  const name = (workspace.expenseNames ?? defaultExpenseNames).find(
    (entry) => entry.id === input.expenseNameId
  )!;
  const member = workspace.team!.find((entry) => entry.id === input.contractorUserId)!;
  const expense = {
    id: input.id ?? input.operationId,
    orderId: order.id,
    expenseNameId: name.id,
    expenseName: name.name,
    kind: name.kind,
    description: name.name,
    note: input.note,
    contractorUserId: member.id,
    contractorName: member.name,
    contractorId: `contractor:${member.id}`,
    amountCents: decimalScaled(input.amount, 2)
  };
  order.expenses = [...(order.expenses ?? []).filter((entry) => entry.id !== expense.id), expense];
  order.salaryModel = 'net';
  order.workflowRevision = (order.workflowRevision ?? 0) + 1;
  await syncNetFixture(order);
  persistFlowFixture();
  return { ok: true as const, data: expense.id };
}
export async function removeOrderExpense(input: RemoveOrderExpenseInput) {
  const order = financeFixtureData().orders.find((entry) => entry.id === input.orderId)!;
  order.expenses = (order.expenses ?? []).filter((entry) => entry.id !== input.id);
  order.workflowRevision = (order.workflowRevision ?? 0) + 1;
  await syncNetFixture(order);
  persistFlowFixture();
  return { ok: true as const, data: input.id };
}

export async function createExpenseName(input: CreateExpenseNameInput) {
  const data = financeFixtureData();
  data.expenseNames ??= structuredClone(defaultExpenseNames);
  if (data.expenseNames.some((entry) => expenseNameKey(entry.name) === expenseNameKey(input.name)))
    return { ok: false as const, error: 'Така назва витрати вже існує. Виберіть її зі списку.' };
  const entry = {
    id: crypto.randomUUID(),
    name: normalizeExpenseName(input.name),
    kind: 'other' as const
  };
  data.expenseNames.push(entry);
  persistFlowFixture();
  return { ok: true as const, data: entry };
}
