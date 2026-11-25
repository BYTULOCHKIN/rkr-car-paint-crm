import type { CrmAccess } from '../api/types';

/** The viewer is supplied by the verified organization context, never by URL filters. */
export function orderAccessPredicate(
  access: CrmAccess | undefined,
  alias: string
): { sql: string; params: string[] } {
  if (!access || access.role === 'admin') return { sql: '1=1', params: [] };
  return {
    sql: `(${alias}.assigneeId=?
      OR json_extract(${alias}.labor,'$.painter.workerId')=?
      OR json_extract(${alias}.labor,'$.polisher.workerId')=?
      OR json_extract(${alias}.labor,'$.assembler.workerId')=?
      OR (${alias}.labor IS NULL AND EXISTS (
        SELECT 1 FROM crm_order_economics e WHERE e.orderId=${alias}.id AND (
          json_extract(e.details,'$.painterId')=? OR json_extract(e.details,'$.polisherId')=?
          OR json_extract(e.details,'$.assemblerId')=?
        )
      ))
      OR EXISTS (SELECT 1 FROM crm_order_expenses expense
        WHERE expense.orderId=${alias}.id AND expense.archived=0 AND expense.contractorUserId=?))`,
    params: Array.from({ length: 8 }, () => access.userId)
  };
}
