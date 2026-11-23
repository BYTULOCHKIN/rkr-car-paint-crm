import type { PeriodReport, SettlementTotals } from '../api/types';
import { payeeKey } from '@/features/order-economics/lib/settlements';
import { sumIntegers } from '@/features/order-economics/lib/integers';

export interface SettlementFilters {
  search: string;
  kind: 'all' | 'worker' | 'contractor';
}

export function accruedInPeriod(row: SettlementTotals): number {
  return sumIntegers([row.accrualCents, row.adjustmentCents]);
}

/** Net recorded payouts; cancellations affect their own period, just as in the ledger. */
export function paidInPeriod(row: SettlementTotals): number {
  return sumIntegers([row.payoutCents, -row.returnCents, -row.reversalCents]);
}

export function filterSettlementReport(
  report: PeriodReport,
  filters: SettlementFilters
): PeriodReport {
  if (report.access.role === 'worker') return report;
  const search = filters.search.normalize('NFKC').trim().toLocaleLowerCase('uk-UA');
  const payees = report.settlements.payees.filter(
    (row) =>
      (filters.kind === 'all' || row.payee.kind === filters.kind) &&
      row.payee.name.normalize('NFKC').toLocaleLowerCase('uk-UA').includes(search)
  );
  const keys = new Set(payees.map((row) => payeeKey(row.payee)));
  return {
    ...report,
    settlements: {
      payees,
      orders: report.settlements.orders.filter((row) => keys.has(payeeKey(row.payee))),
      events: report.settlements.events.filter((row) => keys.has(payeeKey(row.payee)))
    }
  };
}
