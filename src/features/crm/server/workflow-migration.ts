import type { DatabaseSync } from 'node:sqlite';

/** Change only the current status; historical events, delivery facts and postings stay intact. */
export function migrateThreeStatuses(db: DatabaseSync): void {
  const original = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='crm_orders'")
    .get()!.sql as string;
  const sql = original
    .replace("('created','in_progress','ready','delivered')", "('created','in_progress','ready')")
    .replace(/CREATE TABLE\s+["`]?crm_orders["`]?/i, 'CREATE TABLE crm_orders_v17');
  if (sql === original || sql.includes("'delivered'"))
    throw new Error('Не вдалося оновити статуси замовлень');
  const columns = db
    .prepare('PRAGMA table_info(crm_orders)')
    .all()
    .map((column) => `"${column.name}"`);
  const selection = columns.map((column) =>
    column === '"status"' ? "CASE WHEN status='delivered' THEN 'ready' ELSE status END" : column
  );
  const indexes = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='crm_orders' AND sql IS NOT NULL"
    )
    .all();
  const sequence =
    db.prepare("SELECT seq FROM sqlite_sequence WHERE name='crm_orders'").get()?.seq ?? 0;
  db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
  try {
    db.exec(sql);
    db.exec(`INSERT INTO crm_orders_v17 (${columns.join(',')}) SELECT ${selection.join(',')} FROM crm_orders;
      DROP TABLE crm_orders; ALTER TABLE crm_orders_v17 RENAME TO crm_orders;`);
    db.prepare("UPDATE sqlite_sequence SET seq=MAX(seq,?) WHERE name='crm_orders'").run(sequence);
    for (const index of indexes) db.exec(index.sql as string);
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Порушено зв’язки замовлень');
    db.exec('PRAGMA user_version=17; COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('PRAGMA foreign_keys=ON');
  }
}
