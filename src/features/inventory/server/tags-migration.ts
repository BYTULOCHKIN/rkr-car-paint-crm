import type { DatabaseSync } from 'node:sqlite';

export function migrateStockTags(db: DatabaseSync): void {
  if (
    !db
      .prepare('PRAGMA table_info(stock_items)')
      .all()
      .some((column) => column.name === 'tags')
  )
    db.exec(
      `ALTER TABLE stock_items ADD COLUMN tags TEXT NOT NULL DEFAULT '["Розхідник"]' CHECK(json_valid(tags) AND json_type(tags)='array')`
    );
  db.exec(`UPDATE stock_items SET tags='["Розхідник"]' WHERE tags='[]'`);
  db.exec('PRAGMA user_version=21');
}
