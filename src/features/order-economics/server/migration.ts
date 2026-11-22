import type { DatabaseSync } from 'node:sqlite';

export function migrateOrderEconomics(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_order_economics (
      orderId TEXT PRIMARY KEY REFERENCES crm_orders(id) ON DELETE CASCADE, details TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS crm_contractors (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, nameKey TEXT NOT NULL UNIQUE
    );
  `);
}
