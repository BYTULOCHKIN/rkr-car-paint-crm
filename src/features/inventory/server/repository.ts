import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { HistoryActor } from '@/features/crm/api/types';
import type { StockItem, StockMovement } from '../api/types';
import {
  itemSchema,
  stockUnitSchema,
  updateItemSchema,
  receiptSchema,
  adjustmentSchema,
  consumptionSchema,
  reversalSchema,
  quantityMilli
} from '../schemas/inventory';
import type {
  ItemInput,
  UpdateItemInput,
  ReceiptInput,
  AdjustmentInput,
  ConsumptionInput,
  ReversalInput
} from '../schemas/inventory';

export class InventoryError extends Error {}

export const inventoryTables = `
  CREATE TABLE IF NOT EXISTS stock_items (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, nameKey TEXT NOT NULL UNIQUE,
    unit TEXT NOT NULL, notes TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1))
  );
  CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY, itemId TEXT NOT NULL REFERENCES stock_items(id),
    kind TEXT NOT NULL CHECK(kind IN ('receipt','adjustment','consumption','reversal')),
    deltaMilli INTEGER NOT NULL CHECK(deltaMilli != 0),
    orderId TEXT REFERENCES crm_orders(id), reversesId TEXT UNIQUE REFERENCES stock_movements(id),
    note TEXT NOT NULL, actor TEXT NOT NULL, createdAt TEXT NOT NULL,
    fingerprint TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS stock_movements_item ON stock_movements(itemId);
  CREATE INDEX IF NOT EXISTS stock_movements_order ON stock_movements(orderId);
`;

export class InventoryRepository {
  constructor(private db: DatabaseSync) {}

  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  items(): StockItem[] {
    return this.db
      .prepare(`SELECT i.id, i.name, i.unit, i.notes, i.archived,
      EXISTS(SELECT 1 FROM stock_movements WHERE itemId=i.id) AS locked,
      COALESCE((SELECT SUM(deltaMilli) FROM stock_movements WHERE itemId=i.id),0) AS balanceMilli
      FROM stock_items i ORDER BY i.archived, i.name`)
      .all()
      .map((row) => ({
        ...row,
        archived: !!row.archived,
        locked: !!row.locked
      })) as unknown as StockItem[];
  }

  movements(): StockMovement[] {
    return this.db
      .prepare(`SELECT m.id, m.itemId, i.name AS itemName, i.unit, m.kind,
      m.deltaMilli, m.orderId, o.number AS orderNumber, m.reversesId, m.note, m.actor, m.createdAt,
      EXISTS(SELECT 1 FROM stock_movements WHERE reversesId=m.id) AS reversed
      FROM stock_movements m JOIN stock_items i ON i.id=m.itemId
      LEFT JOIN crm_orders o ON o.id=m.orderId ORDER BY m.createdAt DESC, m.rowid DESC`)
      .all()
      .map((row) => ({
        ...row,
        reversed: !!row.reversed,
        actor: JSON.parse(row.actor as string) as HistoryActor
      })) as unknown as StockMovement[];
  }

  private item(id: string): StockItem {
    const item = this.items().find((entry) => entry.id === id);
    if (!item) throw new InventoryError('Складську позицію не знайдено');
    return item;
  }

  private checkName(name: string, except?: string): string {
    const key = name.toLocaleLowerCase('uk-UA');
    const existing = this.db.prepare('SELECT id FROM stock_items WHERE nameKey=?').get(key);
    if (existing && existing.id !== except)
      throw new InventoryError('Позиція з такою назвою вже існує, зокрема перевірте архів');
    return key;
  }

  createItem(input: ItemInput): string {
    const value = itemSchema.parse(input);
    return this.transaction(() => {
      const id = randomUUID();
      const key = this.checkName(value.name);
      this.db
        .prepare('INSERT INTO stock_items (id,name,nameKey,unit,notes) VALUES (?,?,?,?,?)')
        .run(id, value.name, key, value.unit, value.notes);
      return id;
    });
  }

  updateItem(input: UpdateItemInput): void {
    const value = updateItemSchema.parse(input);
    this.transaction(() => {
      const current = this.item(value.id);
      if (current.locked && (current.name !== value.name || current.unit !== value.unit))
        throw new InventoryError('Після першої операції назву та одиницю змінити не можна');
      if (!current.locked) stockUnitSchema.parse(value.unit);
      const key = this.checkName(value.name, value.id);
      this.db
        .prepare('UPDATE stock_items SET name=?,nameKey=?,unit=?,notes=? WHERE id=?')
        .run(value.name, key, value.unit, value.notes, value.id);
    });
  }

  archive(id: string, archived: boolean): void {
    this.transaction(() => {
      this.item(id);
      this.db.prepare('UPDATE stock_items SET archived=? WHERE id=?').run(archived ? 1 : 0, id);
    });
  }

  /** Idempotency key prevents double consumption on network retries. */
  private duplicate(id: string, value: unknown, actor: HistoryActor): boolean {
    const row = this.db.prepare('SELECT fingerprint FROM stock_movements WHERE id=?').get(id);
    const fingerprint = JSON.stringify({ value, actorId: actor.id });
    if (!row) return false;
    if (row.fingerprint !== fingerprint)
      throw new InventoryError('Операцію вже проведено з іншими даними. Оновіть сторінку.');
    return true;
  }

  private insert(
    id: string,
    itemId: string,
    kind: StockMovement['kind'],
    deltaMilli: number,
    orderId: string | null,
    reversesId: string | null,
    note: string,
    actor: HistoryActor,
    value: unknown
  ): void {
    const balance = this.item(itemId).balanceMilli + deltaMilli;
    if (balance < 0)
      throw new InventoryError(
        'Недостатньо матеріалу на складі. Оновіть залишки або внесіть надходження.'
      );
    if (!Number.isSafeInteger(balance))
      throw new InventoryError('Залишок перевищує допустиме значення');
    this.db
      .prepare('INSERT INTO stock_movements VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(
        id,
        itemId,
        kind,
        deltaMilli,
        orderId,
        reversesId,
        note,
        JSON.stringify(actor),
        new Date().toISOString(),
        JSON.stringify({ value, actorId: actor.id })
      );
  }

  receive(input: ReceiptInput, actor: HistoryActor): void {
    const value = receiptSchema.parse(input);
    this.transaction(() => {
      if (this.duplicate(value.operationId, value, actor)) return;
      if (this.item(value.itemId).archived)
        throw new InventoryError('Спочатку відновіть позицію з архіву');
      this.insert(
        value.operationId,
        value.itemId,
        'receipt',
        quantityMilli(value.quantity),
        null,
        null,
        value.note,
        actor,
        value
      );
    });
  }

  adjust(input: AdjustmentInput, actor: HistoryActor): void {
    const value = adjustmentSchema.parse(input);
    this.transaction(() => {
      if (this.duplicate(value.operationId, value, actor)) return;
      if (this.item(value.itemId).archived)
        throw new InventoryError('Спочатку відновіть позицію з архіву');
      this.insert(
        value.operationId,
        value.itemId,
        'adjustment',
        quantityMilli(value.quantity),
        null,
        null,
        value.note,
        actor,
        value
      );
    });
  }

  consume(input: ConsumptionInput, actor: HistoryActor): void {
    const value = consumptionSchema.parse(input);
    this.transaction(() => {
      if (this.duplicate(value.operationId, value, actor)) return;
      const order = this.db.prepare('SELECT status FROM crm_orders WHERE id=?').get(value.orderId);
      if (!order) throw new InventoryError('Замовлення не знайдено');
      if (order.status !== 'in_progress')
        throw new InventoryError('Списання дозволене лише для замовлення «В роботі»');
      if (this.item(value.itemId).archived)
        throw new InventoryError('Не можна списувати архівну позицію');
      this.insert(
        value.operationId,
        value.itemId,
        'consumption',
        -quantityMilli(value.quantity),
        value.orderId,
        null,
        value.note,
        actor,
        value
      );
    });
  }

  reverse(input: ReversalInput, actor: HistoryActor): void {
    const value = reversalSchema.parse(input);
    this.transaction(() => {
      if (this.duplicate(value.operationId, value, actor)) return;
      const movement = this.movements().find((entry) => entry.id === value.movementId);
      if (!movement || movement.kind !== 'consumption')
        throw new InventoryError('Списання не знайдено');
      if (movement.reversed) throw new InventoryError('Це списання вже скасоване');
      this.insert(
        value.operationId,
        movement.itemId,
        'reversal',
        -movement.deltaMilli,
        movement.orderId,
        movement.id,
        value.note,
        actor,
        value
      );
    });
  }
}
