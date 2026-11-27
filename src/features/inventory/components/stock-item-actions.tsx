'use client';

import { RowActions } from '@/features/crm/components/row-actions';
import type { StockItem } from '../api/types';
import { stockItemDeleteBlocker } from '../lib/deletion';

export type StockItemAction =
  | 'details'
  | 'history'
  | 'edit'
  | 'receipt'
  | 'adjustment'
  | 'valuation'
  | 'delete';
interface StockItemActionsProps {
  item: StockItem;
  admin: boolean;
  archivePending: boolean;
  current?: StockItemAction;
  onAction: (kind: StockItemAction, item: StockItem) => void;
  onArchive: (item: StockItem) => void;
}

export function StockItemActions({
  item,
  admin,
  archivePending,
  current,
  onAction,
  onArchive
}: StockItemActionsProps) {
  const action = (kind: StockItemAction) => () => onAction(kind, item);
  return (
    <RowActions
      label={`Дії з позицією ${item.name}`}
      actions={[
        ...(current !== 'details'
          ? [{ label: 'Деталі', icon: 'info' as const, onClick: action('details') }]
          : []),
        { label: 'Історія', icon: 'clock', onClick: action('history') },
        ...(admin
          ? [
              ...(!item.archived && item.accountingMode !== 'amount'
                ? [
                    ...(item.totalCostCents === null && item.balanceMilli > 0
                      ? [
                          {
                            label: 'Оцінити залишок',
                            icon: 'edit' as const,
                            onClick: action('valuation')
                          }
                        ]
                      : []),
                    { label: 'Надходження', icon: 'add' as const, onClick: action('receipt') },
                    {
                      label: 'Коригувати',
                      icon: 'adjustments' as const,
                      onClick: action('adjustment')
                    }
                  ]
                : []),
              { label: 'Редагувати', icon: 'edit' as const, onClick: action('edit') },
              {
                label: item.archived ? 'Відновити' : 'В архів',
                icon: 'inventory' as const,
                disabled: archivePending,
                onClick: () => onArchive(item)
              },
              {
                label: 'Видалити назавжди',
                icon: 'trash' as const,
                variant: 'destructive' as const,
                disabled: !!stockItemDeleteBlocker(item),
                description: stockItemDeleteBlocker(item) ?? undefined,
                onClick: action('delete')
              }
            ]
          : [])
      ]}
    />
  );
}
