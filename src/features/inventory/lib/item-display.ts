import { money } from '@/features/crm/lib/format';
import { roundedRatio } from '@/features/order-economics/lib/integers';
import type { StockItem } from '../api/types';
import { stockQuantity } from './format';

export function stockItemValues(item: StockItem): {
  balance: string;
  totalCost: string;
  unitCost: string;
} {
  if (item.accountingMode === 'amount')
    return { balance: 'Без контролю залишку', totalCost: '—', unitCost: 'За сумою' };
  return {
    balance: `${stockQuantity(item.balanceMilli)} ${item.unit}`,
    totalCost: item.totalCostCents === null ? 'Не визначена' : money(item.totalCostCents),
    unitCost:
      item.totalCostCents === null
        ? 'Не визначена'
        : item.balanceMilli === 0
          ? '—'
          : `${money(roundedRatio(BigInt(item.totalCostCents) * BigInt(1000), BigInt(item.balanceMilli)))} / ${item.unit}`
  };
}
