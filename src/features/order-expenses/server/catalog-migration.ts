import type { DatabaseSync } from 'node:sqlite';
import { defaultExpenseNames, expenseNameKey } from '../lib/names';

export function migrateExpenseCatalog(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS crm_expense_names (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, nameKey TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK(kind IN ('color_matching','soldering','other')), createdAt TEXT NOT NULL
  );`);
  for (const entry of defaultExpenseNames)
    db.prepare('INSERT OR IGNORE INTO crm_expense_names VALUES (?,?,?,?,?)').run(
      entry.id,
      entry.name,
      expenseNameKey(entry.name),
      entry.kind,
      new Date().toISOString()
    );
  const columns = db.prepare('PRAGMA table_info(crm_order_expenses)').all();
  if (!columns.some((column) => column.name === 'expenseNameId')) {
    db.exec(
      'ALTER TABLE crm_order_expenses ADD COLUMN expenseNameId TEXT REFERENCES crm_expense_names(id)'
    );
    db.exec("ALTER TABLE crm_order_expenses ADD COLUMN note TEXT NOT NULL DEFAULT ''");
    db.exec('ALTER TABLE crm_order_expenses ADD COLUMN contractorUserId TEXT');
    db.exec(`UPDATE crm_order_expenses SET expenseNameId=kind,
      note=CASE WHEN description!=(SELECT name FROM crm_expense_names WHERE id=crm_order_expenses.kind) THEN description ELSE '' END,
      description=(SELECT name FROM crm_expense_names WHERE id=crm_order_expenses.kind);`);
  }
  if (
    !db
      .prepare('PRAGMA table_info(crm_contractors)')
      .all()
      .some((column) => column.name === 'teamUserId')
  )
    db.exec('ALTER TABLE crm_contractors ADD COLUMN teamUserId TEXT');
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS crm_contractors_team ON crm_contractors(teamUserId) WHERE teamUserId IS NOT NULL; PRAGMA user_version=20;'
  );
}
