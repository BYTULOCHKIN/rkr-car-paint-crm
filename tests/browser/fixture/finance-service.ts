import { financeFixtureData, getWorkspace, persistFlowFixture } from './service';
import type { RepairOrder } from '@/features/crm/api/types';
import { getInventory, saveInventoryFixture } from './inventory-service';
import type {
  CorrectionInput,
  CashSettlementInput,
  ReverseSettlementInput
} from '@/features/order-economics/schemas/finance';
import type {
  CorrectionPreview,
  EconomicsPosting,
  PayeeAccrual
} from '@/features/order-economics/api/types';
import {
  aggregateAccruals,
  accrualDeltas,
  settlementBalance
} from '@/features/order-economics/lib/settlements';
import {
  previewDetailedEconomics,
  detailedCheckItems
} from '@/features/order-economics/lib/details';
import { orderMaterialCosts } from '@/features/inventory/lib/order-costs';
import { consumeValuedStock } from '@/features/order-economics/lib/stock-valuation';
import { quantityMilli, decimalScaled } from '@/features/inventory/schemas/inventory';
import { paymentBalance } from '@/features/crm/lib/payment-balance';

export async function recordSettlement(input: CashSettlementInput) {
  const workspace = await getWorkspace();
  const data = financeFixtureData();
  const payee =
    input.payeeKind === 'worker'
      ? {
          kind: input.payeeKind,
          id: input.payeeId,
          name: workspace.team!.find((member) => member.id === input.payeeId)!.name
        }
      : data
          .finance!.postings.flatMap((posting) => posting.allocations)
          .find((entry) => entry.payee.id === input.payeeId)!.payee;
  data.finance!.events.push({
    id: input.operationId,
    orderId: input.orderId,
    payee,
    kind: input.kind,
    amountCents: decimalScaled(input.amount, 2),
    postingId: null,
    reversalOf: null,
    note: input.note,
    actor: { id: 'user_owner', name: 'Олена' },
    createdAt: new Date().toISOString()
  });
  persistFlowFixture();
  return { ok: true as const, data: undefined };
}
export async function reverseSettlement(input: ReverseSettlementInput) {
  const data = financeFixtureData();
  const original = data.finance!.events.find((entry) => entry.id === input.eventId)!;
  const next = {
    ...original,
    id: input.operationId,
    kind: 'reversal' as const,
    reversalOf: original.id,
    note: input.note
  };
  try {
    settlementBalance([...data.finance!.events, next], original.orderId, original.payee);
  } catch {
    return { ok: false as const, error: 'Повернення перевищують виплати' };
  }
  data.finance!.events.push(next);
  return { ok: true as const, data: undefined };
}
export async function updateDefaultShare(input: {
  employeeShareBps: number;
  expectedRevision: number;
}) {
  const finance = financeFixtureData().finance!;
  finance.defaultShareBps = input.employeeShareBps;
  finance.settingsRevision++;
  return { ok: true as const, data: undefined };
}
async function simulate(input: CorrectionInput) {
  const workspace = await getWorkspace();
  const data = financeFixtureData();
  const finance = data.finance!;
  const order = data.orders.find((entry) => entry.id === input.orderId)!;
  if (
    (order.workflowRevision ?? 0) !== input.expectedRevision ||
    finance.inventoryRevision !== input.expectedInventoryRevision
  )
    throw new Error('Дані змінилися');
  const stock = structuredClone(await getInventory());
  for (const material of input.materials) {
    if (material.kind === 'consume') {
      const item = stock.items.find((entry) => entry.id === material.itemId)!;
      const amount = consumeValuedStock(
        { quantityMilli: item.balanceMilli, totalCostCents: item.totalCostCents! },
        quantityMilli(material.quantity)
      );
      item.balanceMilli = amount.balance.quantityMilli;
      item.totalCostCents = amount.balance.totalCostCents;
      stock.movements.push({
        id: crypto.randomUUID(),
        itemId: item.id,
        itemName: item.name,
        unit: item.unit,
        kind: 'consumption',
        deltaMilli: -amount.quantityMilli,
        costDeltaCents: -amount.costCents,
        valuationTotalCents: null,
        currency: null,
        purchaseAmountMinor: null,
        exchangeRateMicros: null,
        category: material.category,
        orderId: order.id,
        orderNumber: order.number,
        reversesId: null,
        reversed: false,
        financialLocked: true,
        note: input.note,
        actor: { id: 'user_owner', name: 'Олена' },
        createdAt: new Date().toISOString()
      });
    } else {
      const movement = stock.movements.find((entry) => entry.id === material.movementId)!;
      movement.reversed = true;
      const item = stock.items.find((entry) => entry.id === movement.itemId)!;
      item.balanceMilli -= movement.deltaMilli;
      item.totalCostCents =
        item.totalCostCents === null || movement.costDeltaCents === null
          ? null
          : item.totalCostCents - movement.costDeltaCents;
    }
  }
  const details = {
    ...input.details,
    painterName: workspace.team!.find((entry) => entry.id === input.details.painterId)?.name ?? '',
    polisherName:
      workspace.team!.find((entry) => entry.id === input.details.polisherId)?.name ?? '',
    assemblerName:
      workspace.team!.find((entry) => entry.id === input.details.assemblerId)?.name ?? ''
  };
  const costs = orderMaterialCosts(stock.movements, order.id);
  const result = previewDetailedEconomics(details, costs).result;
  if (!result) throw new Error('Перевірте матеріали');
  const allocations: PayeeAccrual[] = [];
  for (const [role, amountCents] of [
    ['painter', result.painterAccrualCents],
    ['polisher', result.polisherAccrualCents],
    ['assembler', result.assemblerAccrualCents]
  ] as const)
    if (details[`${role}Id`])
      allocations.push({
        payee: { kind: 'worker', id: details[`${role}Id`], name: details[`${role}Name`] },
        amountCents
      });
  const before = finance.postings.filter((posting) => posting.orderId === order.id).at(-1) ?? null;
  const preview: CorrectionPreview = {
    before,
    after: {
      details,
      costs: costs as EconomicsPosting['costs'],
      result,
      allocations: aggregateAccruals(allocations)
    },
    deltas: accrualDeltas(before?.allocations ?? [], allocations)
  };
  return { preview, stock, order };
}
export async function previewFinancialCorrection(input: CorrectionInput) {
  try {
    return { ok: true as const, data: (await simulate(input)).preview };
  } catch (error) {
    return { ok: false as const, error: (error as Error).message };
  }
}
export async function applyFinancialCorrection(input: CorrectionInput) {
  try {
    const { preview, stock, order } = await simulate(input);
    const finance = financeFixtureData().finance!;
    const posting: EconomicsPosting = {
      ...preview.after,
      id: crypto.randomUUID(),
      operationId: input.operationId,
      orderId: order.id,
      revision: (preview.before?.revision ?? 0) + 1,
      kind: 'correction',
      note: input.note,
      actor: { id: 'user_owner', name: 'Олена' },
      createdAt: new Date().toISOString()
    };
    finance.postings.push(posting);
    finance.inventoryRevision = crypto.randomUUID().replaceAll('-', '').padEnd(64, '0');
    for (const delta of preview.deltas)
      finance.events.push({
        id: crypto.randomUUID(),
        orderId: order.id,
        payee: delta.payee,
        kind: 'adjustment',
        amountCents: delta.amountCents,
        postingId: posting.id,
        reversalOf: null,
        note: input.note,
        actor: posting.actor,
        createdAt: posting.createdAt
      });
    order.economics = preview.after.details;
    order.items = detailedCheckItems(preview.after.details);
    order.totalCents = posting.result.checkCents;
    order.workflowRevision = (order.workflowRevision ?? 0) + 1;
    saveInventoryFixture(stock);
    persistFlowFixture();
    return { ok: true as const, data: posting };
  } catch (error) {
    return { ok: false as const, error: (error as Error).message };
  }
}

export async function postReadyFixture(order: RepairOrder) {
  const finance = financeFixtureData().finance!;
  if (finance.postings.some((posting) => posting.orderId === order.id))
    return { ok: true as const };
  const costs = orderMaterialCosts((await getInventory()).movements, order.id);
  const preview = previewDetailedEconomics(order.economics!, costs);
  if (!preview.result || preview.issues.length)
    return { ok: false as const, error: preview.issues.join(' ') };
  const allocations: PayeeAccrual[] = [];
  for (const [role, amountCents] of [
    ['painter', preview.result.painterAccrualCents],
    ['polisher', preview.result.polisherAccrualCents],
    ['assembler', preview.result.assemblerAccrualCents]
  ] as const) {
    const details = order.economics!;
    if (details[`${role}Id`])
      allocations.push({
        payee: {
          kind: 'worker',
          id: details[`${role}Id`],
          name: details[`${role}Name`] || 'Працівник'
        },
        amountCents
      });
  }
  const posting: EconomicsPosting = {
    id: crypto.randomUUID(),
    operationId: crypto.randomUUID(),
    orderId: order.id,
    revision: 1,
    kind: 'initial',
    details: order.economics!,
    costs: costs as EconomicsPosting['costs'],
    result: preview.result,
    allocations: aggregateAccruals(allocations),
    note: 'Готовність авто',
    actor: { id: 'user_worker', name: 'Маляр Андрій' },
    createdAt: new Date().toISOString()
  };
  finance.postings.push(posting);
  for (const entry of posting.allocations)
    finance.events.push({
      id: crypto.randomUUID(),
      orderId: order.id,
      payee: entry.payee,
      kind: 'accrual',
      amountCents: entry.amountCents,
      postingId: posting.id,
      reversalOf: null,
      note: posting.note,
      actor: posting.actor,
      createdAt: posting.createdAt
    });
  return { ok: true as const };
}
export async function refundPayment(
  _orgId: string,
  input: { orderId: string; operationId: string; amount: string; note: string }
) {
  const data = financeFixtureData();
  const order = data.orders.find((entry) => entry.id === input.orderId)!;
  const amountCents = decimalScaled(input.amount, 2);
  if (amountCents > paymentBalance(order, data.payments).overpaidCents)
    return { ok: false as const, error: 'Повернення перевищує переплату' };
  const id = crypto.randomUUID();
  data.payments!.push({
    id,
    operationId: input.operationId,
    orderId: order.id,
    kind: 'refund',
    amountCents,
    reversalOf: null,
    note: input.note,
    actor: { id: 'user_owner', name: 'Олена' },
    createdAt: new Date().toISOString()
  });
  return { ok: true as const, data: id };
}
