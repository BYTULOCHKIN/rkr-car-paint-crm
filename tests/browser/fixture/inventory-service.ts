import type { InventoryData, StockMovement } from '@/features/inventory/api/types';
import type {
  ItemInput,
  UpdateItemInput,
  ReceiptInput,
  AdjustmentInput,
  ConsumptionInput,
  ReversalInput,
  ValuationInput
} from '@/features/inventory/schemas/inventory';
import { quantityMilli, decimalScaled } from '@/features/inventory/schemas/inventory';
import { consumeValuedStock, valuePurchase } from '@/features/order-economics/lib/stock-valuation';
import { getWorkspace } from './service';

const initial: InventoryData = {
  access: { userId: 'user_worker', orgId: 'org_test', role: 'admin' },
  items: [
    {
      id: '00000000-0000-4000-8000-000000000901',
      name: 'Фарба',
      unit: 'л',
      notes: '',
      archived: false,
      locked: true,
      balanceMilli: 1000,
      totalCostCents: 100000,
      valuationRevision: 0
    },
    {
      id: '00000000-0000-4000-8000-000000000902',
      name: 'Лак (старий залишок)',
      unit: 'л',
      notes: '',
      archived: false,
      locked: true,
      balanceMilli: 2000,
      totalCostCents: null,
      valuationRevision: 0
    }
  ],
  movements: []
};
function data(): InventoryData {
  const value: InventoryData = JSON.parse(
    sessionStorage.getItem('stock-fixture') ?? JSON.stringify(initial)
  );
  value.access.role =
    new URLSearchParams(location.search).get('role') === 'worker' ? 'worker' : 'admin';
  return value;
}
function save(value: InventoryData) {
  sessionStorage.setItem('stock-fixture', JSON.stringify(value));
  return { ok: true as const, data: undefined };
}
export async function getInventory() {
  return data();
}
export async function createStockItem(_org: string, input: ItemInput) {
  const value = data();
  const id = crypto.randomUUID();
  value.items.push({
    ...input,
    id,
    archived: false,
    locked: false,
    balanceMilli: 0,
    totalCostCents: 0,
    valuationRevision: 0
  });
  save(value);
  return { ok: true as const, data: id };
}
export async function updateStockItem(_org: string, input: UpdateItemInput) {
  const value = data();
  Object.assign(
    value.items.find((item) => item.id === input.id)!,
    input
  );
  return save(value);
}
export async function archiveStockItem(_org: string, input: { id: string; archived: boolean }) {
  const value = data();
  value.items.find((item) => item.id === input.id)!.archived = input.archived;
  return save(value);
}
async function move(
  input: ReceiptInput | AdjustmentInput | ConsumptionInput,
  kind: StockMovement['kind'],
  orderId: string | null = null
) {
  const value = data();
  const item = value.items.find((entry) => entry.id === input.itemId)!;
  const deltaMilli = quantityMilli(input.quantity) * (kind === 'consumption' ? -1 : 1);
  if (item.balanceMilli + deltaMilli < 0)
    return { ok: false as const, error: 'Недостатньо матеріалу на складі' };
  const pricing =
    'totalAmount' in input && input.totalAmount
      ? {
          currency: input.currency ?? 'UAH',
          amountMinor: decimalScaled(input.totalAmount, 2),
          exchangeRateMicros: decimalScaled(input.exchangeRate ?? '1', 6)
        }
      : null;
  const costDeltaCents =
    deltaMilli > 0
      ? pricing
        ? valuePurchase(pricing)
        : null
      : item.totalCostCents === null
        ? null
        : -consumeValuedStock(
            { quantityMilli: item.balanceMilli, totalCostCents: item.totalCostCents },
            -deltaMilli
          ).costCents;
  item.balanceMilli += deltaMilli;
  item.totalCostCents =
    item.balanceMilli === 0
      ? 0
      : item.totalCostCents === null || costDeltaCents === null
        ? null
        : item.totalCostCents + costDeltaCents;
  item.valuationRevision++;
  item.locked = true;
  const order = (await getWorkspace()).orders.find((entry) => entry.id === orderId);
  value.movements.unshift({
    id: input.operationId,
    itemId: item.id,
    itemName: item.name,
    unit: item.unit,
    kind,
    deltaMilli,
    costDeltaCents,
    valuationTotalCents: null,
    currency: pricing?.currency ?? null,
    purchaseAmountMinor: pricing?.amountMinor ?? null,
    exchangeRateMicros: pricing?.exchangeRateMicros ?? null,
    category:
      kind === 'consumption'
        ? 'category' in input
          ? (input.category ?? 'painting')
          : 'painting'
        : null,
    orderId,
    orderNumber: order?.number ?? null,
    reversesId: null,
    reversed: false,
    note: input.note,
    actor: { id: 'user_worker', name: 'Адміністратор' },
    createdAt: new Date().toISOString()
  });
  return save(value);
}
export async function receiveStock(_org: string, input: ReceiptInput) {
  return move(input, 'receipt');
}
export async function adjustStock(_org: string, input: AdjustmentInput) {
  return move(input, 'adjustment');
}
export async function consumeStock(_org: string, input: ConsumptionInput) {
  return move(input, 'consumption', input.orderId);
}
export async function reverseConsumption(_org: string, input: ReversalInput) {
  const value = data();
  const original = value.movements.find((entry) => entry.id === input.movementId)!;
  original.reversed = true;
  const item = value.items.find((item) => item.id === original.itemId)!;
  item.balanceMilli -= original.deltaMilli;
  const costDeltaCents = original.costDeltaCents === null ? null : -original.costDeltaCents;
  item.totalCostCents =
    item.totalCostCents === null || costDeltaCents === null
      ? null
      : item.totalCostCents + costDeltaCents;
  item.valuationRevision++;
  value.movements.unshift({
    ...original,
    id: input.operationId,
    deltaMilli: -original.deltaMilli,
    costDeltaCents,
    kind: 'reversal',
    reversed: false,
    reversesId: original.id,
    note: input.note,
    createdAt: new Date().toISOString()
  });
  return save(value);
}
export async function valueStockBalance(_org: string, input: ValuationInput) {
  const value = data();
  const item = value.items.find((item) => item.id === input.itemId)!;
  item.totalCostCents = decimalScaled(input.totalAmount, 2);
  item.valuationRevision++;
  value.movements.unshift({
    id: input.operationId,
    itemId: item.id,
    itemName: item.name,
    unit: item.unit,
    kind: 'valuation',
    deltaMilli: 0,
    costDeltaCents: null,
    valuationTotalCents: item.totalCostCents,
    currency: null,
    purchaseAmountMinor: null,
    exchangeRateMicros: null,
    category: null,
    orderId: null,
    orderNumber: null,
    reversesId: null,
    reversed: false,
    note: input.note,
    actor: { id: 'user_worker', name: 'Адміністратор' },
    createdAt: new Date().toISOString()
  });
  return save(value);
}
