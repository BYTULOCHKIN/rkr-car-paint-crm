import type { OverviewOrderMetric, OverviewPeriod } from '../schemas/period';

/** Internal aliases only; all user values remain bound parameters. */
export function overviewOrderPredicate(
  metric: OverviewOrderMetric,
  period: OverviewPeriod,
  alias: 't' | 'o' = 't'
): { sql: string; params: string[] } {
  if (metric === 'created_period')
    return { sql: `crm_day(${alias}.createdAt) BETWEEN ? AND ?`, params: [period.from, period.to] };
  const ready = `${alias}.status IN ('ready','delivered') AND COALESCE(${alias}.actualReadyDate,${alias}.actualDeliveryDate) BETWEEN ? AND ?`;
  const paid = `COALESCE((SELECT SUM(amountCents * CASE WHEN kind='payment' THEN 1 ELSE -1 END) FROM crm_payments WHERE orderId=${alias}.id),0) + COALESCE((SELECT SUM(amountCents * CASE WHEN kind='refund' THEN -1 ELSE 1 END) FROM crm_customer_refunds WHERE orderId=${alias}.id),0)`;
  const unpaid = `(SELECT COALESCE(SUM(quantity*unitPriceCents),0) FROM crm_order_items WHERE orderId=${alias}.id) > (${paid})`;
  const posted = `EXISTS(SELECT 1 FROM crm_economics_postings WHERE orderId=${alias}.id)`;
  if (metric === 'receipts')
    return {
      sql: `EXISTS(SELECT 1 FROM (SELECT id,orderId,kind,createdAt FROM crm_payments UNION ALL SELECT id,orderId,kind,createdAt FROM crm_customer_refunds) p WHERE p.orderId=${alias}.id AND p.kind IN ('payment','refund') AND crm_day(p.createdAt) BETWEEN ? AND ? AND NOT EXISTS(SELECT 1 FROM crm_payments r WHERE r.reversalOf=p.id) AND NOT EXISTS(SELECT 1 FROM crm_customer_refunds r WHERE r.reversalOf=p.id))`,
      params: [period.from, period.to]
    };
  const sql =
    metric === 'open_debt'
      ? `${alias}.status NOT IN ('ready','delivered') AND crm_day(${alias}.createdAt) BETWEEN ? AND ? AND ${unpaid}`
      : `${ready}${metric === 'profit' ? ` AND ${posted}` : metric === 'unposted' ? ` AND NOT ${posted}` : metric === 'ready_debt' ? ` AND ${unpaid}` : ''}`;
  return { sql, params: [period.from, period.to] };
}
