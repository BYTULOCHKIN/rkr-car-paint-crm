import type { DatabaseSync } from 'node:sqlite';

/** Preserve movement IDs, row order and reversals while allowing cost-only consumption. */
export function migrateStockAccountingMode(db: DatabaseSync): void {
  const original = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='stock_movements'")
    .get()!.sql as string;
  if (
    db
      .prepare('PRAGMA table_info(stock_items)')
      .all()
      .some((column) => column.name === 'accountingMode') &&
    original.includes('costDeltaCents IS NOT NULL')
  ) {
    db.exec('PRAGMA user_version=23');
    return;
  }
  const updated = original
    .replace(/CREATE TABLE\s+["`]?stock_movements["`]?/i, 'CREATE TABLE stock_movements_v23')
    .replace(
      /CHECK\s*\(\s*deltaMilli\s*!=\s*0\s*\)/i,
      "CHECK(deltaMilli != 0 OR (kind IN ('consumption','reversal') AND costDeltaCents IS NOT NULL AND costDeltaCents != 0 AND orderId IS NOT NULL))"
    );
  if (updated === original || !updated.includes('costDeltaCents IS NOT NULL'))
    throw new Error('Не вдалося оновити облік матеріалів');
  const columns = db
    .prepare('PRAGMA table_info(stock_movements)')
    .all()
    .map((column) => `"${column.name}"`)
    .join(',');
  const indexes = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE tbl_name='stock_movements' AND type IN ('index','trigger') AND sql IS NOT NULL"
    )
    .all();
  db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
  try {
    db.exec(
      "ALTER TABLE stock_items ADD COLUMN accountingMode TEXT NOT NULL DEFAULT 'quantity' CHECK(accountingMode IN ('quantity','amount'))"
    );
    db.exec(updated);
    db.exec(`INSERT INTO stock_movements_v23(rowid,${columns}) SELECT rowid,${columns} FROM stock_movements;
      DROP TABLE stock_movements; ALTER TABLE stock_movements_v23 RENAME TO stock_movements;`);
    for (const index of indexes) db.exec(index.sql as string);
    db.exec(`CREATE TRIGGER stock_movements_accounting_mode BEFORE INSERT ON stock_movements
      WHEN ((SELECT accountingMode FROM stock_items WHERE id=NEW.itemId)='amount' AND
        (NEW.deltaMilli!=0 OR NEW.kind NOT IN ('consumption','reversal') OR NEW.costDeltaCents IS NULL OR NEW.costDeltaCents=0))
      OR ((SELECT accountingMode FROM stock_items WHERE id=NEW.itemId)='quantity' AND NEW.deltaMilli=0)
      BEGIN SELECT RAISE(ABORT,'Несумісний режим обліку матеріалу'); END;`);
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Порушено зв’язки складських операцій');
    db.exec('PRAGMA user_version=23; COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys=ON');
  }
}
