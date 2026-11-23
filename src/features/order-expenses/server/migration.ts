import type { DatabaseSync } from 'node:sqlite';
import type { OrderEconomicsDetails } from '@/features/order-economics/api/types';

export function migrateOrderExpenses(db: DatabaseSync): void {
  if (
    !db
      .prepare('PRAGMA table_info(crm_orders)')
      .all()
      .some((column) => column.name === 'salaryModel')
  )
    db.exec(
      "ALTER TABLE crm_orders ADD COLUMN salaryModel TEXT NOT NULL DEFAULT 'legacy' CHECK(salaryModel IN ('legacy','net'));"
    );
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_order_expenses (
      id TEXT PRIMARY KEY, orderId TEXT NOT NULL REFERENCES crm_orders(id),
      kind TEXT NOT NULL CHECK(kind IN ('color_matching','soldering','other')),
      description TEXT NOT NULL, contractorId TEXT NOT NULL REFERENCES crm_contractors(id),
      contractorName TEXT NOT NULL, amountCents INTEGER NOT NULL CHECK(amountCents>=0),
      archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)), createdAt TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS crm_expenses_order ON crm_order_expenses(orderId, archived);
    CREATE TABLE IF NOT EXISTS crm_order_expense_operations (
      operationId TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, orderId TEXT NOT NULL REFERENCES crm_orders(id),
      expenseId TEXT NOT NULL REFERENCES crm_order_expenses(id), snapshot TEXT NOT NULL,
      actor TEXT NOT NULL, createdAt TEXT NOT NULL
    );
  `);
  const insert = db.prepare(
    'INSERT OR IGNORE INTO crm_order_expenses(id,orderId,kind,description,contractorId,contractorName,amountCents,createdAt) VALUES (?,?,?,?,?,?,?,?)'
  );
  for (const row of db.prepare('SELECT orderId,details FROM crm_order_economics').all()) {
    const details = JSON.parse(row.details as string) as OrderEconomicsDetails;
    for (const line of details.lines)
      if (line.kind !== 'painting' && line.kind !== 'assembly' && line.contractorId)
        insert.run(
          `${row.orderId}:${line.id}`,
          row.orderId,
          line.kind,
          line.description,
          line.contractorId,
          line.contractorName,
          line.subcontractCostCents,
          new Date().toISOString()
        );
  }
  db.exec('PRAGMA user_version=18');
}
