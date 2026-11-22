import type { WorkerSettlementBalance, WorkerSettlementEntry } from '../api/types';
import { EconomicsError, integer, safeNumber } from './integers';

/** Entries must already be scoped to one worker and organization by the service. */
export function workerSettlementBalance(
  entries: readonly WorkerSettlementEntry[]
): WorkerSettlementBalance {
  let accrued = BigInt(0);
  let paid = BigInt(0);
  for (const entry of entries) {
    integer(
      entry.amountCents,
      'Сума операції',
      entry.kind === 'adjustment' ? -Number.MAX_SAFE_INTEGER : 0
    );
    const amount = BigInt(entry.amountCents);
    switch (entry.kind) {
      case 'accrual':
      case 'adjustment':
        accrued += amount;
        break;
      case 'payout':
        paid += amount;
        break;
      case 'return':
        paid -= amount;
        break;
      default:
        throw new EconomicsError('Невідомий вид розрахункової операції');
    }
  }
  if (accrued < BigInt(0)) throw new EconomicsError('Нарахування не може бути від’ємним');
  if (paid < BigInt(0)) throw new EconomicsError('Повернення перевищують виплати');
  const balanceCents = safeNumber(accrued - paid);
  return {
    accruedCents: safeNumber(accrued),
    paidCents: safeNumber(paid),
    balanceCents,
    payableCents: Math.max(0, balanceCents),
    advanceCents: Math.max(0, -balanceCents)
  };
}
