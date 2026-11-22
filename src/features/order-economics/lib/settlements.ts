import type {
  PayeeAccrual,
  SettlementEvent,
  SettlementPayee,
  WorkerSettlementBalance
} from '../api/types';
import { workerSettlementBalance } from './worker-balance';
import { sumIntegers } from './integers';

export function payeeKey(payee: Pick<SettlementPayee, 'kind' | 'id'>): string {
  return `${payee.kind}:${payee.id}`;
}
export function aggregateAccruals(allocations: readonly PayeeAccrual[]): PayeeAccrual[] {
  const result = new Map<string, PayeeAccrual>();
  for (const entry of allocations) {
    const key = payeeKey(entry.payee);
    const prior = result.get(key);
    result.set(key, {
      payee: entry.payee,
      amountCents: sumIntegers([prior?.amountCents ?? 0, entry.amountCents])
    });
  }
  return [...result.values()].toSorted((a, b) =>
    payeeKey(a.payee).localeCompare(payeeKey(b.payee))
  );
}
export function accrualDeltas(
  before: readonly PayeeAccrual[],
  after: readonly PayeeAccrual[]
): PayeeAccrual[] {
  return aggregateAccruals([
    ...before.map((entry) => ({ ...entry, amountCents: -entry.amountCents })),
    ...after
  ]).filter((entry) => entry.amountCents !== 0);
}
export function settlementBalance(
  events: readonly SettlementEvent[],
  orderId: string,
  payee: Pick<SettlementPayee, 'kind' | 'id'>
): WorkerSettlementBalance {
  const scoped = events.filter(
    (event) => event.orderId === orderId && payeeKey(event.payee) === payeeKey(payee)
  );
  const reversed = new Set(scoped.map((entry) => entry.reversalOf).filter(Boolean));
  return workerSettlementBalance(
    scoped.flatMap((entry) =>
      entry.kind === 'reversal' || reversed.has(entry.id)
        ? []
        : [{ kind: entry.kind, amountCents: entry.amountCents }]
    )
  );
}
