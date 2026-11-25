import type { StockItem } from '../api/types';

export function stockItemDeleteBlocker(item: StockItem): string | null {
  if (item.locked) return 'Є історія операцій — позицію можна архівувати.';
  if (item.balanceMilli !== 0 || item.totalCostCents !== 0)
    return 'Залишок або його вартість не нульові — позицію можна архівувати.';
  return null;
}
