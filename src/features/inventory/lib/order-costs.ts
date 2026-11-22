import type { StockMovement } from '../api/types';
import { sumIntegers } from '@/features/order-economics/lib/integers';

export interface OrderMaterialCosts {
  paintingCents: number | null;
  polishingCents: number | null;
  unallocatedCents: number | null;
  totalCents: number | null;
}

function cost(entries: readonly StockMovement[]): number | null {
  return entries.some((entry) => entry.costDeltaCents === null)
    ? null
    : sumIntegers(entries.map((entry) => -entry.costDeltaCents!));
}

/** Reversed consumptions are excluded, including legacy ones with unknown cost. */
export function orderMaterialCosts(
  movements: readonly StockMovement[],
  orderId: string
): OrderMaterialCosts {
  const active = movements.filter(
    (movement) =>
      movement.orderId === orderId && movement.kind === 'consumption' && !movement.reversed
  );
  return {
    paintingCents: cost(active.filter((entry) => entry.category === 'painting')),
    polishingCents: cost(active.filter((entry) => entry.category === 'polishing')),
    unallocatedCents: cost(active.filter((entry) => entry.category === null)),
    totalCents: cost(active)
  };
}
