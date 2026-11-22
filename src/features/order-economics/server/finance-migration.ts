import type { DatabaseSync } from 'node:sqlite';

export function migrateFinance(db: DatabaseSync): void {
  if (
    !db
      .prepare('PRAGMA table_info(crm_orders)')
      .all()
      .some((column) => column.name === 'defaultEmployeeShareBps')
  )
    db.exec(
      'ALTER TABLE crm_orders ADD COLUMN defaultEmployeeShareBps INTEGER NOT NULL DEFAULT 6000'
    );
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_customer_refunds (
      id TEXT PRIMARY KEY, operationId TEXT NOT NULL UNIQUE,
      orderId TEXT NOT NULL REFERENCES crm_orders(id), kind TEXT NOT NULL CHECK(kind IN ('refund','refund_reversal')),
      amountCents INTEGER NOT NULL CHECK(amountCents>0), reversalOf TEXT UNIQUE REFERENCES crm_customer_refunds(id),
      note TEXT NOT NULL, actor TEXT NOT NULL, createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS crm_economics_postings (
      id TEXT PRIMARY KEY, operationId TEXT NOT NULL UNIQUE,
      orderId TEXT NOT NULL REFERENCES crm_orders(id), revision INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('initial','correction')), snapshot TEXT NOT NULL,
      note TEXT NOT NULL, actor TEXT NOT NULL, createdAt TEXT NOT NULL, fingerprint TEXT NOT NULL,
      UNIQUE(orderId,revision)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS crm_initial_posting ON crm_economics_postings(orderId) WHERE kind='initial';
    CREATE TABLE IF NOT EXISTS crm_settlement_events (
      id TEXT PRIMARY KEY, orderId TEXT NOT NULL REFERENCES crm_orders(id),
      payeeKind TEXT NOT NULL CHECK(payeeKind IN ('worker','contractor')), payeeId TEXT NOT NULL, payeeName TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('accrual','adjustment','payout','return','reversal')),
      amountCents INTEGER NOT NULL, postingId TEXT REFERENCES crm_economics_postings(id),
      reversalOf TEXT UNIQUE REFERENCES crm_settlement_events(id), note TEXT NOT NULL, actor TEXT NOT NULL,
      createdAt TEXT NOT NULL, fingerprint TEXT NOT NULL,
      CHECK(kind='adjustment' OR amountCents>=0)
    );
    CREATE INDEX IF NOT EXISTS crm_settlements_order ON crm_settlement_events(orderId,payeeKind,payeeId);
  `);
}
