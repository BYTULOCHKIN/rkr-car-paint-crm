import type { DatabaseSync } from 'node:sqlite';

export function migrateOrderTrash(db: DatabaseSync): void {
  const columns = db.prepare('PRAGMA table_info(crm_orders)').all();
  if (!columns.some((column) => column.name === 'deletedAt'))
    db.exec('ALTER TABLE crm_orders ADD COLUMN deletedAt TEXT');
  if (!columns.some((column) => column.name === 'deletedBy'))
    db.exec('ALTER TABLE crm_orders ADD COLUMN deletedBy TEXT');
  db.exec(
    'CREATE INDEX IF NOT EXISTS crm_orders_trash ON crm_orders(deletedAt); PRAGMA user_version=19;'
  );
}

/** Any historical operation blocks trash, including reversals and zero accrual snapshots. */
export function orderTrashBlockers(db: DatabaseSync): Map<string, string> {
  const reasons = new Map<string, string>();
  const sources = [
    ['crm_payments', 'Є оплати клієнта або їх скасування.'],
    ['crm_customer_refunds', 'Є повернення коштів клієнту.'],
    ['crm_settlement_events', 'Є нарахування або виплати працівникам чи підрядникам.'],
    ['crm_economics_postings', 'Є проведений розрахунок зарплати.'],
    ['stock_movements', 'Є складські операції за замовленням.'],
    ['stock_consumption_batches', 'Є збережені списання матеріалів.'],
    ['crm_order_expenses', 'Є записи витрат на субпідряд.']
  ] as const;
  for (const [table, reason] of sources) {
    for (const row of db
      .prepare(`SELECT DISTINCT orderId FROM ${table} WHERE orderId IS NOT NULL`)
      .all())
      if (!reasons.has(row.orderId as string)) reasons.set(row.orderId as string, reason);
  }
  return reasons;
}
