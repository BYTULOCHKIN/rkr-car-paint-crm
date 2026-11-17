import type { InventoryData, StockMovement } from '@/features/inventory/api/types';
import type {
  ItemInput,
  UpdateItemInput,
  ReceiptInput,
  AdjustmentInput,
  ConsumptionInput,
  ReversalInput
} from '@/features/inventory/schemas/inventory';
import { quantityMilli } from '@/features/inventory/schemas/inventory';
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
      balanceMilli: 1000
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
  value.items.push({ ...input, id, archived: false, locked: false, balanceMilli: 0 });
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
  input: ReceiptInput,
  kind: StockMovement['kind'],
  orderId: string | null = null
) {
  const value = data();
  const item = value.items.find((entry) => entry.id === input.itemId)!;
  const deltaMilli = quantityMilli(input.quantity) * (kind === 'consumption' ? -1 : 1);
  if (item.balanceMilli + deltaMilli < 0)
    return { ok: false as const, error: 'Недостатньо матеріалу на складі' };
  item.balanceMilli += deltaMilli;
  item.locked = true;
  const order = (await getWorkspace()).orders.find((entry) => entry.id === orderId);
  value.movements.unshift({
    id: input.operationId,
    itemId: item.id,
    itemName: item.name,
    unit: item.unit,
    kind,
    deltaMilli,
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
  value.items.find((item) => item.id === original.itemId)!.balanceMilli -= original.deltaMilli;
  value.movements.unshift({
    ...original,
    id: input.operationId,
    deltaMilli: -original.deltaMilli,
    kind: 'reversal',
    reversed: false,
    reversesId: original.id,
    note: input.note,
    createdAt: new Date().toISOString()
  });
  return save(value);
}
