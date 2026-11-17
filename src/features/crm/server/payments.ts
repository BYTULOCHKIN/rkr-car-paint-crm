import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { HistoryActor, PaymentEvent } from '../api/types';
import {
  paymentSchema,
  reversePaymentSchema,
  type PaymentInput,
  type ReversePaymentInput
} from '../schemas/payment';

export class PaymentError extends Error {}

export const paymentTables = `
CREATE TABLE IF NOT EXISTS crm_payments (
 id TEXT PRIMARY KEY, operationId TEXT NOT NULL UNIQUE,
 orderId TEXT NOT NULL REFERENCES crm_orders(id),
 kind TEXT NOT NULL CHECK(kind IN ('payment','reversal')),
 amountCents INTEGER NOT NULL CHECK(amountCents > 0),
 reversalOf TEXT UNIQUE REFERENCES crm_payments(id), note TEXT NOT NULL,
 actor TEXT NOT NULL, createdAt TEXT NOT NULL,
 CHECK((kind='payment' AND reversalOf IS NULL) OR (kind='reversal' AND reversalOf IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS crm_payments_order ON crm_payments(orderId, createdAt);
`;

export class PaymentRepository {
  constructor(private readonly db: DatabaseSync) {}
  list(): PaymentEvent[] {
    return this.db
      .prepare('SELECT * FROM crm_payments ORDER BY createdAt, rowid')
      .all()
      .map((row) => ({
        ...row,
        actor: JSON.parse(row.actor as string)
      })) as unknown as PaymentEvent[];
  }
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
  receive(input: PaymentInput, actor: HistoryActor): string {
    const value = paymentSchema.parse(input);
    const amountCents = Math.round(Number(value.amount.replace(',', '.')) * 100);
    return this.transaction(() => {
      const prior = this.list().find((entry) => entry.operationId === value.operationId);
      if (prior) {
        if (
          prior.kind !== 'payment' ||
          prior.orderId !== value.orderId ||
          prior.amountCents !== amountCents ||
          prior.note !== value.note ||
          prior.actor.id !== actor.id
        )
          throw new PaymentError('Ідентифікатор операції вже використано');
        return prior.id;
      }
      if (!this.db.prepare('SELECT id FROM crm_orders WHERE id=?').get(value.orderId))
        throw new PaymentError('Замовлення не знайдено');
      const total = this.db
        .prepare(
          'SELECT COALESCE(SUM(quantity*unitPriceCents),0) AS total FROM crm_order_items WHERE orderId=?'
        )
        .get(value.orderId)!.total as number;
      const paid = this.list()
        .filter((entry) => entry.orderId === value.orderId)
        .reduce(
          (sum, entry) => sum + (entry.kind === 'payment' ? entry.amountCents : -entry.amountCents),
          0
        );
      if (paid + amountCents > total) throw new PaymentError('Оплата перевищує залишок до сплати');
      return this.insert(
        value.operationId,
        value.orderId,
        'payment',
        amountCents,
        null,
        value.note,
        actor
      );
    });
  }
  reverse(input: ReversePaymentInput, actor: HistoryActor): string {
    const value = reversePaymentSchema.parse(input);
    return this.transaction(() => {
      const events = this.list();
      const prior = events.find((entry) => entry.operationId === value.operationId);
      if (prior) {
        if (
          prior.kind !== 'reversal' ||
          prior.reversalOf !== value.paymentId ||
          prior.note !== value.note ||
          prior.actor.id !== actor.id
        )
          throw new PaymentError('Ідентифікатор операції вже використано');
        return prior.id;
      }
      const payment = events.find(
        (entry) => entry.id === value.paymentId && entry.kind === 'payment'
      );
      if (!payment) throw new PaymentError('Платіж не знайдено');
      if (events.some((entry) => entry.reversalOf === payment.id))
        throw new PaymentError('Платіж уже скасовано');
      return this.insert(
        value.operationId,
        payment.orderId,
        'reversal',
        payment.amountCents,
        payment.id,
        value.note,
        actor
      );
    });
  }
  private insert(
    operationId: string,
    orderId: string,
    kind: 'payment' | 'reversal',
    amount: number,
    reversalOf: string | null,
    note: string,
    actor: HistoryActor
  ): string {
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO crm_payments VALUES (?,?,?,?,?,?,?,?,?)')
      .run(
        id,
        operationId,
        orderId,
        kind,
        amount,
        reversalOf,
        note,
        JSON.stringify(actor),
        new Date().toISOString()
      );
    return id;
  }
}

/** Preserve every order column, relation and the monotonically increasing order number. */
export function migrateCreatedStatus(db: DatabaseSync): void {
  const original = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='crm_orders'")
    .get()!.sql as string;
  const sql = original
    .replace("('in_progress','ready','delivered')", "('created','in_progress','ready','delivered')")
    .replace(/CREATE TABLE\s+["`]?crm_orders["`]?/i, 'CREATE TABLE crm_orders_v11');
  if (!sql.includes("'created'")) throw new Error('Не вдалося оновити статуси замовлень');
  const columns = db
    .prepare('PRAGMA table_info(crm_orders)')
    .all()
    .map((column) => `"${column.name}"`)
    .join(',');
  const sequence =
    db.prepare("SELECT seq FROM sqlite_sequence WHERE name='crm_orders'").get()?.seq ?? 0;
  db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
  try {
    db.exec(sql);
    db.exec(
      `INSERT INTO crm_orders_v11 (${columns}) SELECT ${columns} FROM crm_orders; DROP TABLE crm_orders; ALTER TABLE crm_orders_v11 RENAME TO crm_orders;`
    );
    db.prepare("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='crm_orders'").run(sequence);
    db.exec(paymentTables);
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Порушено зв’язки замовлень');
    db.exec('PRAGMA user_version=11; COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys=ON');
  }
}
