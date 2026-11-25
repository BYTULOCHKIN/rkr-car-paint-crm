import type { SaveOrderLaborInput } from '@/features/order-labor/schemas/labor';
import { financeFixtureData, persistFlowFixture } from './service';
import { syncNetFixture } from './net-salary';
export async function saveOrderLabor(input: SaveOrderLaborInput) {
  const workspace = financeFixtureData();
  const order = workspace.orders.find((entry) => entry.id === input.orderId)!;
  if ((order.workflowRevision ?? 0) !== input.expectedRevision)
    return { ok: false as const, error: 'Замовлення вже змінено' };
  order.labor = structuredClone(input.labor);
  for (const role of ['painter', 'polisher', 'assembler'] as const)
    order.labor[role].workerName =
      workspace.team?.find((member) => member.id === order.labor![role].workerId)?.name ?? '';
  order.workflowRevision = (order.workflowRevision ?? 0) + 1;
  order.salaryModel = 'net';
  await syncNetFixture(order);
  persistFlowFixture();
  return { ok: true as const, data: null };
}
