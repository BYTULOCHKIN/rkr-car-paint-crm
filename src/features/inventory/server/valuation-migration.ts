import type { DatabaseSync } from 'node:sqlite';

/** Called inside the CRM migration transaction. Historic costs stay unknown. */
export function migrateStockValuation(db: DatabaseSync): void {
  const columns = new Set(
    db
      .prepare('PRAGMA table_info(stock_movements)')
      .all()
      .map((row) => row.name)
  );
  for (const [name, type] of Object.entries({
    costDeltaCents: 'INTEGER',
    currency: 'TEXT',
    purchaseAmountMinor: 'INTEGER',
    exchangeRateMicros: 'INTEGER',
    category: 'TEXT'
  })) {
    if (!columns.has(name)) db.exec(`ALTER TABLE stock_movements ADD COLUMN ${name} ${type}`);
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_item_values (
      itemId TEXT PRIMARY KEY REFERENCES stock_items(id),
      totalCostCents INTEGER CHECK(totalCostCents IS NULL OR totalCostCents >= 0),
      revision INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO stock_item_values(itemId,totalCostCents)
      SELECT i.id, CASE WHEN COALESCE(SUM(m.deltaMilli),0)=0 THEN 0 ELSE NULL END
      FROM stock_items i LEFT JOIN stock_movements m ON m.itemId=i.id GROUP BY i.id;
    CREATE TABLE IF NOT EXISTS stock_valuation_events (
      id TEXT PRIMARY KEY, itemId TEXT NOT NULL REFERENCES stock_items(id),
      totalCostCents INTEGER NOT NULL CHECK(totalCostCents >= 0),
      quantityMilli INTEGER NOT NULL CHECK(quantityMilli > 0),
      note TEXT NOT NULL, actor TEXT NOT NULL, createdAt TEXT NOT NULL,
      fingerprint TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS stock_valuation_events_item ON stock_valuation_events(itemId);
  `);
}
