import { financeFixtureData, persistFlowFixture } from './service';
import { getInventory } from './inventory-service';
import { netSalarySnapshot } from '@/features/order-expenses/lib/snapshot';
import { accrualDeltas } from '@/features/order-economics/lib/settlements';
import { orderMaterialCosts } from '@/features/inventory/lib/order-costs';
import type { RepairOrder } from '@/features/crm/api/types';
import type { EconomicsPosting } from '@/features/order-economics/api/types';

export async function syncNetFixture(order: RepairOrder): Promise<void> {
  if (order.status !== 'ready') return;
  const workspace = financeFixtureData();
  const finance = (workspace.finance ??= {
    defaultShareBps: 6000,
    settingsRevision: 0,
    inventoryRevision: '0'.repeat(64),
    postings: [],
    events: []
  });
  const snapshot = netSalarySnapshot(
    order,
    orderMaterialCosts((await getInventory()).movements, order.id)
  );
  const previous = finance.postings.filter((entry) => entry.orderId === order.id).at(-1);
  if (
    previous &&
    previous.model === snapshot.model &&
    JSON.stringify(previous.result) === JSON.stringify(snapshot.result) &&
    JSON.stringify(previous.allocations) === JSON.stringify(snapshot.allocations) &&
    JSON.stringify(previous.expenses) === JSON.stringify(snapshot.expenses)
  )
    return;
  const posting: EconomicsPosting = {
    ...snapshot,
    id: crypto.randomUUID(),
    operationId: crypto.randomUUID(),
    orderId: order.id,
    revision: (previous?.revision ?? 0) + 1,
    kind: previous ? 'correction' : 'initial',
    note: 'Автоматичний перерахунок',
    actor: { id: 'user_owner', name: 'Олена' },
    createdAt: new Date().toISOString()
  };
  finance.postings.push(posting);
  for (const delta of accrualDeltas(previous?.allocations ?? [], snapshot.allocations))
    finance.events.push({
      id: crypto.randomUUID(),
      orderId: order.id,
      payee: delta.payee,
      kind: previous ? 'adjustment' : 'accrual',
      amountCents: delta.amountCents,
      postingId: posting.id,
      reversalOf: null,
      note: posting.note,
      actor: posting.actor,
      createdAt: posting.createdAt
    });
  persistFlowFixture();
}
