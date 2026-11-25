import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { CrmAccess, HistoryActor } from '@/features/crm/api/types';
import { orderAccessPredicate } from '@/features/crm/server/order-access';
import type { StockItem, StockMovement, InventoryFilters, MovementFilters } from '../api/types';
import { normalizeSearch, type PageResult } from '@/features/crm/lib/pagination';
import { inventoryFiltersSchema, movementFiltersSchema } from '../schemas/filters';
import { consumeValuedStock, valuePurchase } from '@/features/order-economics/lib/stock-valuation';
import { sumIntegers, roundedRatio } from '@/features/order-economics/lib/integers';
import {
  itemSchema,
  stockUnitSchema,
  updateItemSchema,
  receiptSchema,
  adjustmentSchema,
  consumptionSchema,
  batchConsumptionSchema,
  reversalSchema,
  quantityMilli,
  decimalScaled,
  materialAmountCents,
  valuationSchema
} from '../schemas/inventory';
import { editConsumptionSchema, type EditConsumptionInput } from '../schemas/inventory';
import { deleteStockItemSchema, type DeleteStockItemInput } from '../schemas/inventory';
import { stockItemDeleteBlocker } from '../lib/deletion';
import type {
  ItemInput,
  UpdateItemInput,
  ReceiptInput,
  AdjustmentInput,
  ConsumptionInput,
  BatchConsumptionInput,
  ReversalInput,
  ValuationInput
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

export const consumptionBatchTable = `
  CREATE TABLE IF NOT EXISTS stock_consumption_batches (
    id TEXT PRIMARY KEY,
    orderId TEXT NOT NULL REFERENCES crm_orders(id),
    fingerprint TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS stock_consumption_edits (
    id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL
  );
`;

export class InventoryRepository {
  constructor(private db: DatabaseSync) {
    db.function('crm_search', { deterministic: true }, (value) =>
      normalizeSearch(String(value ?? ''))
    );
  }

  private transaction<T>(work: () => T): T {
    if (this.db.isTransaction) return work();
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

  private itemRows(where = '', params: (string | number)[] = [], suffix = ''): StockItem[] {
    return this.db
      .prepare(`SELECT i.id, i.name, i.unit, i.accountingMode, i.notes, i.tags, i.archived,
      v.totalCostCents, v.revision AS valuationRevision,
      (EXISTS(SELECT 1 FROM stock_movements WHERE itemId=i.id) OR EXISTS(SELECT 1 FROM stock_valuation_events WHERE itemId=i.id)) AS locked,
      COALESCE((SELECT SUM(deltaMilli) FROM stock_movements WHERE itemId=i.id),0) AS balanceMilli
      FROM stock_items i JOIN stock_item_values v ON v.itemId=i.id ${where}
      ORDER BY i.archived, i.name, i.id ${suffix}`)
      .all(...params)
      .map((row) => ({
        ...row,
        tags: JSON.parse(row.tags as string),
        archived: !!row.archived,
        locked: !!row.locked
      })) as unknown as StockItem[];
  }

  items(): StockItem[] {
    return this.itemRows();
  }

  orderItems(orderId: string): StockItem[] {
    return this.itemRows('WHERE i.id IN (SELECT itemId FROM stock_movements WHERE orderId=?)', [
      orderId
    ]);
  }

  listItems(input: InventoryFilters): PageResult<StockItem> {
    const filters = inventoryFiltersSchema.parse(input);
    const conditions = ['i.archived=?'];
    const params: (string | number)[] = [Number(filters.archived)];
    for (const word of normalizeSearch(filters.search).split(/\s+/).filter(Boolean)) {
      conditions.push(
        "instr(crm_search(i.name || ' ' || i.notes || ' ' || COALESCE((SELECT group_concat(value,' ') FROM json_each(i.tags)),'')), ?) > 0"
      );
      params.push(word);
    }
    if (filters.tags.length) {
      conditions.push(
        `EXISTS(SELECT 1 FROM json_each(i.tags) WHERE value IN (${filters.tags.map(() => '?').join(',')}))`
      );
      params.push(...filters.tags);
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    return this.transaction(() => {
      const total = this.db
        .prepare(`SELECT COUNT(*) AS total FROM stock_items i ${where}`)
        .get(...params)!.total as number;
      return {
        total,
        page: filters.page,
        pageSize: filters.pageSize,
        items: this.itemRows(
          where,
          [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
          'LIMIT ? OFFSET ?'
        )
      };
    });
  }

  private movementAccess(access?: CrmAccess): { sql: string; params: string[] } {
    if (!access || access.role === 'admin') return { sql: '1=1', params: [] };
    const orders = orderAccessPredicate(access, 'o');
    return {
      sql: `(orderId IS NULL OR orderId IN (SELECT o.id FROM crm_orders o WHERE o.deletedAt IS NULL AND ${orders.sql}))`,
      params: orders.params
    };
  }

  movements(access?: CrmAccess): StockMovement[] {
    const visibility = this.movementAccess(access);
    return this.movementRows(`WHERE ${visibility.sql}`, visibility.params);
  }

  private movementRows(where = '', params: (string | number)[] = [], suffix = ''): StockMovement[] {
    return this.db
      .prepare(`SELECT * FROM (SELECT m.id AS id, m.itemId, i.name AS itemName, i.unit, i.accountingMode, m.kind,
      m.deltaMilli, m.orderId, o.number AS orderNumber, m.reversesId, m.note, m.actor, m.createdAt,
      m.costDeltaCents, m.currency, m.purchaseAmountMinor, m.exchangeRateMicros, m.category,
      NULL AS valuationTotalCents,
      EXISTS(SELECT 1 FROM stock_movements WHERE reversesId=m.id) AS reversed, m.rowid AS sortOrder,
      EXISTS(SELECT 1 FROM crm_economics_postings WHERE orderId=m.orderId) AS financialLocked
      FROM stock_movements m JOIN stock_items i ON i.id=m.itemId
      LEFT JOIN crm_orders o ON o.id=m.orderId
      UNION ALL
      SELECT v.id,v.itemId,i.name,i.unit,i.accountingMode,'valuation',0,NULL,NULL,NULL,v.note,v.actor,v.createdAt,
      NULL,NULL,NULL,NULL,NULL,v.totalCostCents,0,v.rowid,0
      FROM stock_valuation_events v JOIN stock_items i ON i.id=v.itemId
       ) ${where} ORDER BY createdAt DESC, sortOrder DESC, id DESC ${suffix}`)
      .all(...params)
      .map((row) => {
        const { sortOrder: _sortOrder, ...movement } = row;
        return {
          ...movement,
          reversed: !!row.reversed,
          financialLocked: !!row.financialLocked,
          actor: JSON.parse(row.actor as string) as HistoryActor
        };
      }) as unknown as StockMovement[];
  }

  listMovements(input: MovementFilters, access?: CrmAccess): PageResult<StockMovement> {
    const filters = movementFiltersSchema.parse(input);
    const visibility = this.movementAccess(access);
    const conditions: string[] = [visibility.sql];
    const params: string[] = [...visibility.params];
    if (filters.itemId) {
      conditions.push('itemId=?');
      params.push(filters.itemId);
    }
    if (filters.orderId) {
      conditions.push('orderId=?');
      params.push(filters.orderId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.transaction(() => {
      const movementWhere = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const movements = this.db
        .prepare(`SELECT COUNT(*) AS total FROM stock_movements ${movementWhere}`)
        .get(...params)!.total as number;
      const valuations = filters.orderId
        ? 0
        : (this.db
            .prepare(
              `SELECT COUNT(*) AS total FROM stock_valuation_events ${filters.itemId ? 'WHERE itemId=?' : ''}`
            )
            .get(...(filters.itemId ? [filters.itemId] : []))!.total as number);
      return {
        total: movements + valuations,
        page: filters.page,
        pageSize: filters.pageSize,
        items: this.movementRows(
          where,
          [...params, filters.pageSize, (filters.page - 1) * filters.pageSize],
          'LIMIT ? OFFSET ?'
        )
      };
    });
  }

  movementCount(orderId: string): number {
    return this.db
      .prepare('SELECT COUNT(*) AS total FROM stock_movements WHERE orderId=?')
      .get(orderId)!.total as number;
  }

  orderMovements(orderId: string): StockMovement[] {
    return this.movementRows('WHERE orderId=?', [orderId]);
  }

  reportMovements(from: string, to: string): StockMovement[] {
    return this.movementRows(
      "WHERE orderId IS NOT NULL AND kind IN ('consumption','reversal') AND (crm_day(createdAt) BETWEEN ? AND ? OR crm_day(createdAt) IS NULL)",
      [from, to]
    );
  }

  private item(id: string): StockItem {
    const item = this.itemRows('WHERE i.id=?', [id])[0];
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
        .prepare(
          'INSERT INTO stock_items (id,name,nameKey,unit,accountingMode,notes,tags) VALUES (?,?,?,?,?,?,?)'
        )
        .run(
          id,
          value.name,
          key,
          value.accountingMode === 'amount' ? '' : value.unit,
          value.accountingMode ?? 'quantity',
          value.notes,
          JSON.stringify(value.tags ?? ['Розхідник'])
        );
      this.db.prepare('INSERT INTO stock_item_values(itemId,totalCostCents) VALUES (?,0)').run(id);
      return id;
    });
  }

  updateItem(input: UpdateItemInput): void {
    const value = updateItemSchema.parse(input);
    this.transaction(() => {
      const current = this.item(value.id);
      const accountingMode = value.accountingMode ?? current.accountingMode ?? 'quantity';
      const unit = accountingMode === 'amount' ? '' : value.unit;
      if (current.locked && accountingMode !== current.accountingMode)
        throw new InventoryError('Після першої операції режим обліку змінити не можна');
      if (current.locked && (current.name !== value.name || current.unit !== unit))
        throw new InventoryError('Після першої операції назву та одиницю змінити не можна');
      if (!current.locked && accountingMode === 'quantity') stockUnitSchema.parse(unit);
      const key = this.checkName(value.name, value.id);
      this.db
        .prepare(
          'UPDATE stock_items SET name=?,nameKey=?,unit=?,accountingMode=?,notes=?,tags=? WHERE id=?'
        )
        .run(
          value.name,
          key,
          unit,
          accountingMode,
          value.notes,
          JSON.stringify(value.tags ?? current.tags),
          value.id
        );
    });
  }

  archive(id: string, archived: boolean): void {
    this.transaction(() => {
      this.item(id);
      this.db.prepare('UPDATE stock_items SET archived=? WHERE id=?').run(archived ? 1 : 0, id);
    });
  }

  deleteItem(input: DeleteStockItemInput): void {
    const value = deleteStockItemSchema.parse(input);
    this.transaction(() => {
      const item = this.item(value.id);
      if (item.name !== value.expectedName || item.archived !== value.expectedArchived)
        throw new InventoryError('Позицію вже змінено. Оновіть склад і повторіть дію.');
      const reason = stockItemDeleteBlocker(item);
      if (reason) throw new InventoryError(`Не можна видалити позицію назавжди: ${reason}`);
      this.db.prepare('DELETE FROM stock_item_values WHERE itemId=?').run(item.id);
      this.db.prepare('DELETE FROM stock_items WHERE id=?').run(item.id);
    });
  }

  /** Idempotency key prevents double consumption on network retries. */
  private duplicate(
    id: string,
    value: unknown,
    actor: HistoryActor,
    kind: StockMovement['kind']
  ): boolean {
    if (this.db.prepare('SELECT id FROM stock_consumption_edits WHERE id=?').get(id))
      throw new InventoryError('Ідентифікатор операції вже використано для редагування списання.');
    const row = this.db
      .prepare(`SELECT fingerprint,kind FROM stock_movements WHERE id=?
      UNION ALL SELECT fingerprint,'valuation' FROM stock_valuation_events WHERE id=?`)
      .get(id, id);
    const fingerprint = JSON.stringify({ value, actorId: actor.id });
    if (!row) return false;
    if (row.fingerprint !== fingerprint || row.kind !== kind)
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
    value: unknown,
    costDeltaCents: number | null,
    pricing?: { currency: 'UAH' | 'EUR'; totalAmount: string; exchangeRate: string },
    category: StockMovement['category'] = null
  ): void {
    const item = this.item(itemId);
    const amountOnly = item.accountingMode === 'amount';
    if (
      amountOnly &&
      (deltaMilli !== 0 || !['consumption', 'reversal'].includes(kind) || !costDeltaCents)
    )
      throw new InventoryError('Для матеріалу за сумою доступні лише витрати на замовлення');
    if (!amountOnly && deltaMilli === 0) throw new InventoryError('Вкажіть кількість матеріалу');
    const balance = sumIntegers([item.balanceMilli, deltaMilli]);
    if (balance < 0)
      throw new InventoryError(
        'Недостатньо матеріалу на складі. Оновіть залишки або внесіть надходження.'
      );
    if (!Number.isSafeInteger(balance))
      throw new InventoryError('Залишок перевищує допустиме значення');
    this.db
      .prepare(`INSERT INTO stock_movements
        (id,itemId,kind,deltaMilli,orderId,reversesId,note,actor,createdAt,fingerprint,
         costDeltaCents,currency,purchaseAmountMinor,exchangeRateMicros,category)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
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
        JSON.stringify({ value, actorId: actor.id }),
        costDeltaCents,
        pricing?.currency ?? null,
        pricing ? decimalScaled(pricing.totalAmount, 2) : null,
        pricing ? decimalScaled(pricing.exchangeRate, 6) : null,
        category
      );
    if (amountOnly) return;
    const totalCostCents =
      balance === 0
        ? 0
        : item.totalCostCents === null || costDeltaCents === null
          ? null
          : sumIntegers([item.totalCostCents, costDeltaCents]);
    this.db
      .prepare('UPDATE stock_item_values SET totalCostCents=?, revision=revision+1 WHERE itemId=?')
      .run(totalCostCents, itemId);
  }

  private purchaseCost(value: {
    currency: 'UAH' | 'EUR';
    totalAmount: string;
    exchangeRate: string;
  }): number {
    return valuePurchase({
      currency: value.currency,
      amountMinor: decimalScaled(value.totalAmount, 2),
      exchangeRateMicros: decimalScaled(value.exchangeRate, 6)
    });
  }

  private consumptionValue(
    item: StockItem,
    value: { quantity: string; amount?: string }
  ): { quantity: number; amount: number | null } {
    if (item.accountingMode === 'amount') {
      const amount = materialAmountCents(value.amount ?? '');
      if (amount === null || value.quantity)
        throw new InventoryError('Вкажіть суму витрати без кількості');
      return { quantity: 0, amount };
    }
    if (value.amount || !value.quantity)
      throw new InventoryError('Для кількісного матеріалу вкажіть кількість, а не суму');
    return { quantity: quantityMilli(value.quantity), amount: null };
  }

  private consumptionCost(itemId: string, quantity: number): number | null {
    const item = this.item(itemId);
    if (quantity > item.balanceMilli) throw new InventoryError('Недостатньо матеріалу на складі');
    return item.totalCostCents === null
      ? null
      : consumeValuedStock(
          { quantityMilli: item.balanceMilli, totalCostCents: item.totalCostCents },
          quantity
        ).costCents;
  }

  receive(input: ReceiptInput, actor: HistoryActor): void {
    const value = receiptSchema.parse(input);
    this.transaction(() => {
      if (this.duplicate(value.operationId, value, actor, 'receipt')) return;
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
        value,
        this.purchaseCost(value),
        value
      );
    });
  }

  adjust(input: AdjustmentInput, actor: HistoryActor): void {
    const value = adjustmentSchema.parse(input);
    this.transaction(() => {
      if (this.duplicate(value.operationId, value, actor, 'adjustment')) return;
      if (this.item(value.itemId).archived)
        throw new InventoryError('Спочатку відновіть позицію з архіву');
      const delta = quantityMilli(value.quantity);
      const cost =
        delta > 0 ? this.purchaseCost(value) : this.consumptionCost(value.itemId, -delta);
      this.insert(
        value.operationId,
        value.itemId,
        'adjustment',
        delta,
        null,
        null,
        value.note,
        actor,
        value,
        cost === null ? null : delta > 0 ? cost : -cost,
        delta > 0 ? value : undefined
      );
    });
  }

  consumeBatch(input: BatchConsumptionInput, actor: HistoryActor): void {
    const value = batchConsumptionSchema.parse(input);
    const fingerprint = JSON.stringify({ value, actor });
    this.transaction(() => {
      const existing = this.db
        .prepare('SELECT fingerprint FROM stock_consumption_batches WHERE id=?')
        .get(value.operationId);
      if (existing) {
        if (existing.fingerprint !== fingerprint)
          throw new InventoryError(
            'Це збереження вже виконано з іншими даними. Відкрийте нову форму списання.'
          );
        return;
      }
      for (const row of value.rows)
        this.consume({ ...row, orderId: value.orderId, operationId: randomUUID() }, actor);
      this.db
        .prepare(
          'INSERT INTO stock_consumption_batches(id,orderId,fingerprint,createdAt) VALUES (?,?,?,?)'
        )
        .run(value.operationId, value.orderId, fingerprint, new Date().toISOString());
    });
  }

  consume(input: ConsumptionInput, actor: HistoryActor, financialCorrection = false): void {
    const value = consumptionSchema.parse(input);
    this.transaction(() => {
      if (this.duplicate(value.operationId, value, actor, 'consumption')) return;
      const order = this.db
        .prepare('SELECT status,salaryModel FROM crm_orders WHERE id=? AND deletedAt IS NULL')
        .get(value.orderId);
      if (!order) throw new InventoryError('Замовлення не знайдено');
      if (
        !financialCorrection &&
        order.salaryModel !== 'net' &&
        this.db.prepare('SELECT id FROM crm_economics_postings WHERE orderId=?').get(value.orderId)
      )
        throw new InventoryError(
          'Матеріали проведеного замовлення змінюються через фінансове коригування'
        );
      if (
        !financialCorrection &&
        order.status !== 'in_progress' &&
        !(order.salaryModel === 'net' && order.status === 'ready')
      )
        throw new InventoryError('Списання дозволене лише для замовлення «В роботі»');
      if (this.item(value.itemId).archived)
        throw new InventoryError('Не можна списувати архівну позицію');
      const consumed = this.consumptionValue(this.item(value.itemId), value);
      const cost = consumed.amount ?? this.consumptionCost(value.itemId, consumed.quantity);
      if (cost === null && !financialCorrection)
        throw new InventoryError(
          'Собівартість матеріалу не визначена. Спочатку оцініть залишок на складі.'
        );
      this.insert(
        value.operationId,
        value.itemId,
        'consumption',
        -consumed.quantity,
        value.orderId,
        null,
        value.note,
        actor,
        value,
        cost === null ? null : -cost,
        undefined,
        value.category
      );
    });
  }

  /** A replacement and reversal are one atomic operation; original movements remain immutable. */
  editConsumption(input: EditConsumptionInput, actor: HistoryActor): void {
    const value = editConsumptionSchema.parse(input);
    const fingerprint = JSON.stringify({ value, actorId: actor.id });
    this.transaction(() => {
      const duplicate = this.db
        .prepare('SELECT fingerprint FROM stock_consumption_edits WHERE id=?')
        .get(value.operationId);
      if (duplicate) {
        if (duplicate.fingerprint !== fingerprint)
          throw new InventoryError('Операцію вже проведено з іншими даними.');
        return;
      }
      if (
        this.db
          .prepare(
            `SELECT id FROM stock_movements WHERE id=? UNION ALL SELECT id FROM stock_valuation_events WHERE id=? UNION ALL SELECT id FROM stock_consumption_batches WHERE id=?`
          )
          .get(value.operationId, value.operationId, value.operationId)
      )
        throw new InventoryError('Ідентифікатор операції вже використано.');
      const original = this.orderMovements(value.orderId).find(
        (entry) => entry.id === value.movementId
      );
      if (!original || original.kind !== 'consumption' || original.reversed)
        throw new InventoryError('Списання вже змінено або скасовано. Оновіть сторінку.');
      const order = this.db
        .prepare('SELECT status FROM crm_orders WHERE id=? AND deletedAt IS NULL')
        .get(value.orderId);
      if (!order || !['in_progress', 'ready'].includes(String(order.status)))
        throw new InventoryError('Редагування доступне в статусах «В роботі» та «Готово».');
      const item = this.item(value.itemId);
      if (item.archived) throw new InventoryError('Не можна списувати архівну позицію');
      if (original.itemId === value.itemId && original.costDeltaCents === null)
        throw new InventoryError(
          'Собівартість історичного списання не визначена. Скасуйте його, оцініть повернений залишок і створіть нове списання.'
        );
      const consumed = this.consumptionValue(item, value);
      const quantity = consumed.quantity;
      let cost: number | null;
      if (consumed.amount !== null) cost = consumed.amount;
      else if (original.itemId === value.itemId && original.costDeltaCents !== null) {
        const previousQuantity = -original.deltaMilli;
        if (quantity <= previousQuantity) {
          cost = roundedRatio(
            BigInt(-original.costDeltaCents) * BigInt(quantity),
            BigInt(previousQuantity)
          );
        } else {
          const extraCost = this.consumptionCost(value.itemId, quantity - previousQuantity);
          if (extraCost === null)
            throw new InventoryError('Спочатку визначте собівартість матеріалу.');
          cost = sumIntegers([-original.costDeltaCents, extraCost]);
        }
      } else cost = this.consumptionCost(value.itemId, quantity);
      if (cost === null)
        throw new InventoryError('Спочатку визначте собівартість матеріалу на складі.');
      this.reverse(
        { movementId: original.id, operationId: randomUUID(), note: 'Виправлення списання' },
        actor
      );
      this.insert(
        randomUUID(),
        value.itemId,
        'consumption',
        -quantity,
        value.orderId,
        null,
        value.note,
        actor,
        value,
        -cost,
        undefined,
        value.category
      );
      this.db
        .prepare('INSERT INTO stock_consumption_edits VALUES (?,?)')
        .run(value.operationId, fingerprint);
    });
  }

  reverse(input: ReversalInput, actor: HistoryActor, financialCorrection = false): void {
    const value = reversalSchema.parse(input);
    this.transaction(() => {
      if (this.duplicate(value.operationId, value, actor, 'reversal')) return;
      const movement = this.movements().find((entry) => entry.id === value.movementId);
      if (!movement || movement.kind !== 'consumption')
        throw new InventoryError('Списання не знайдено');
      if (movement.reversed) throw new InventoryError('Це списання вже скасоване');
      if (
        !financialCorrection &&
        movement.financialLocked &&
        this.db.prepare('SELECT salaryModel FROM crm_orders WHERE id=?').get(movement.orderId!)
          ?.salaryModel !== 'net'
      )
        throw new InventoryError('Скасування списання потребує фінансового коригування');
      this.insert(
        value.operationId,
        movement.itemId,
        'reversal',
        -movement.deltaMilli,
        movement.orderId,
        movement.id,
        value.note,
        actor,
        value,
        movement.costDeltaCents === null ? null : -movement.costDeltaCents,
        undefined,
        movement.category
      );
    });
  }

  valueOpeningBalance(input: ValuationInput, actor: HistoryActor): void {
    const value = valuationSchema.parse(input);
    this.transaction(() => {
      if (this.duplicate(value.operationId, value, actor, 'valuation')) return;
      const item = this.item(value.itemId);
      if (item.archived) throw new InventoryError('Спочатку відновіть позицію з архіву');
      if (
        item.valuationRevision !== value.expectedRevision ||
        item.balanceMilli !== value.expectedBalanceMilli
      )
        throw new InventoryError('Залишок змінено. Оновіть сторінку та повторіть оцінювання.');
      if (item.totalCostCents !== null)
        throw new InventoryError('Собівартість залишку вже визначена');
      const totalCostCents = decimalScaled(value.totalAmount, 2);
      this.db
        .prepare('INSERT INTO stock_valuation_events VALUES (?,?,?,?,?,?,?,?)')
        .run(
          value.operationId,
          item.id,
          totalCostCents,
          item.balanceMilli,
          value.note,
          JSON.stringify(actor),
          new Date().toISOString(),
          JSON.stringify({ value, actorId: actor.id })
        );
      this.db
        .prepare(
          'UPDATE stock_item_values SET totalCostCents=?, revision=revision+1 WHERE itemId=?'
        )
        .run(totalCostCents, item.id);
    });
  }
}
