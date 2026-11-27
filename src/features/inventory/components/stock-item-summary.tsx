import type { StockItem } from '../api/types';
import { stockItemValues } from '../lib/item-display';

export function StockItemSummary({ item }: { item: StockItem }) {
  const values = stockItemValues(item);
  const fields =
    item.accountingMode === 'amount'
      ? [
          ['Облік матеріалу', 'За сумою'],
          ['Залишок', values.balance]
        ]
      : [
          ['Залишок', values.balance],
          ['Вартість залишку', values.totalCost],
          ['Середня за одиницю', values.unitCost]
        ];
  return (
    <dl className='flex flex-col divide-y rounded-lg border px-3 text-sm'>
      {fields.map(([label, value]) => (
        <div key={label} className='flex min-w-0 items-start justify-between gap-3 py-2.5'>
          <dt className='text-muted-foreground min-w-0 flex-1 text-xs'>{label}</dt>
          <dd className='max-w-[65%] text-right font-medium break-words tabular-nums'>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
