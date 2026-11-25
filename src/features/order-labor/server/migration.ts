import type { DatabaseSync } from 'node:sqlite';

export function migrateOrderLabor(db: DatabaseSync): void {
  if (
    !db
      .prepare('PRAGMA table_info(crm_orders)')
      .all()
      .some((column) => column.name === 'labor')
  )
    db.exec('ALTER TABLE crm_orders ADD COLUMN labor TEXT');
  db.exec(`CREATE TABLE IF NOT EXISTS crm_order_labor_operations (
    id TEXT PRIMARY KEY, orderId TEXT NOT NULL REFERENCES crm_orders(id), fingerprint TEXT NOT NULL
  )`);
}
