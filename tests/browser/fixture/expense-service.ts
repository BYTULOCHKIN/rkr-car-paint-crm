import { financeFixtureData, getWorkspace, persistFlowFixture } from './service';
import { syncNetFixture } from './net-salary';
import type {
  OrderExpenseInput,
  RemoveOrderExpenseInput
} from '@/features/order-expenses/schemas/expenses';
import { decimalScaled } from '@/features/inventory/schemas/inventory';
export async function saveOrderExpense(input: OrderExpenseInput) {
  const workspace = await getWorkspace();
  const order = financeFixtureData().orders.find((entry) => entry.id === input.orderId)!;
  if (workspace.access?.role !== 'admin' || order.workflowRevision !== input.expectedRevision)
    return { ok: false as const, error: 'Замовлення змінилося' };
  const expense = {
    id: input.id ?? input.operationId,
    orderId: order.id,
    kind: input.kind,
    description: input.description,
    contractorName: input.contractorName,
    contractorId: `contractor:${input.contractorName}`,
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
