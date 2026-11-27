import { Badge } from '@/components/ui/badge';
import type { StockItem } from '../api/types';

export function StockItemAvailability({ item }: { item: StockItem }) {
  if (item.accountingMode === 'amount') return null;
  return item.balanceMilli > 0 ? (
    <Badge variant='secondary'>В наявності</Badge>
  ) : (
    <Badge variant='outline'>Немає залишку</Badge>
  );
}
