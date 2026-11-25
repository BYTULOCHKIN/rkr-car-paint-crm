'use client';

import { Suspense, useState, type ReactElement, type ReactNode } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Icons } from '@/components/icons';
import type { RepairOrder, CrmAccess } from '@/features/crm/api/types';
import { inventoryQueries } from '../api/queries';
import { ConsumptionDialog } from './consumption-dialog';
import { MovementHistory } from './movement-history';
import type { StockMovement } from '../api/types';
import { stockQuantity } from '../lib/format';
import { orderMaterialCosts } from '../lib/order-costs';
import { money } from '@/features/crm/lib/format';
import { roundedRatio } from '@/features/order-economics/lib/integers';
import type { FormState } from '@/features/crm/components/form-status';

const costLabel = (amount: number | null) =>
  amount === null ? 'Потрібно визначити собівартість' : money(amount);
function Materials({
  order,
  access,
  onStateChange,
  disabled = false,
  children
}: {
  children?: ReactNode;
  order: RepairOrder;
  access: CrmAccess;
  onStateChange?: (state: FormState) => void;
  disabled?: boolean;
}) {
  const { data } = useSuspenseQuery(inventoryQueries.order(access.userId, access.orgId, order.id));
  const [editing, setEditing] = useState<StockMovement | 'new' | null>(null);
  const movements = data.movements.filter((movement) => movement.orderId === order.id);
  const active = movements.filter((entry) => entry.kind === 'consumption' && !entry.reversed);
  const admin = access.role === 'admin' && data.access.role === 'admin';
  const editable = order.status === 'in_progress' || order.status === 'ready';
  const costs = orderMaterialCosts(movements, order.id);
  const summary = [
    {
      label: 'Матеріали фарбування',
      amount:
        costs.paintingCents === null || costs.unallocatedCents === null
          ? null
          : costs.paintingCents + costs.unallocatedCents,
      count: active.filter((entry) => entry.category !== 'polishing').length,
      unit: 'списань'
    },
    {
      label: 'Матеріали полірування',
      amount: costs.polishingCents,
      count: active.filter((entry) => entry.category === 'polishing').length,
      unit: 'списань'
    },
    {
      label: 'Субпідряд',
      amount: (order.expenses ?? []).reduce((sum, entry) => sum + entry.amountCents, 0),
      count: order.expenses?.length ?? 0,
      unit: 'послуг'
    }
  ];
  return (
    <section className='flex flex-col gap-6' aria-label='Матеріали замовлення'>
      <p className='text-muted-foreground text-sm'>
        Внутрішні витрати замовлення. Не змінюють чек і не потрапляють у PDF клієнта.
      </p>
      <dl data-slot='order-cost-summary' className='grid grid-cols-3 gap-3 border-y py-3 sm:gap-6'>
        {summary.map((entry) => (
          <div key={entry.label} className='flex min-w-0 flex-col gap-1'>
            <dt className='text-muted-foreground text-xs'>{entry.label}</dt>
            <dd className='text-base font-semibold tabular-nums [overflow-wrap:anywhere] sm:text-lg'>
              {costLabel(entry.amount)}
            </dd>
            <p className='text-muted-foreground text-xs'>
              {entry.count} {entry.unit}
            </p>
          </div>
        ))}
      </dl>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='font-semibold'>Списання зі складу</h3>
        {admin && editable && active.length > 0 && (
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={disabled}
            onClick={() => setEditing('new')}
          >
            <Icons.add data-icon='inline-start' />
            Додати списання
          </Button>
        )}
      </div>
      <p className='-mt-4 text-muted-foreground text-xs'>
        Призначення задається для кожного списання окремо і не залежить від тегу матеріалу на
        складі. Щоб змінити — відкрийте списання.
      </p>
      {!active.length && (
        <div className='flex flex-col items-start gap-2 border-y py-6'>
          <h4 className='text-sm font-medium'>Списань ще немає</h4>
          <p className='text-muted-foreground text-sm'>
            Додайте використані матеріали: за кількістю зі складу або за сумою витрати.
          </p>
          {admin && editable && (
            <Button type='button' disabled={disabled} onClick={() => setEditing('new')}>
              <Icons.add data-icon='inline-start' />
              Додати списання
            </Button>
          )}
        </div>
      )}
      {!!active.length && (
        <div className='min-w-0'>
          <div className='hidden grid-cols-[minmax(0,1.6fr)_5rem_8rem_7.5rem_2rem] gap-3 border-b pb-2 text-xs text-muted-foreground sm:grid'>
            <span>Матеріал</span>
            <span>Кількість</span>
            <span>Собівартість</span>
            <span>Призначення</span>
            <span className='sr-only'>Дії</span>
          </div>
          {active.map((entry) => (
            <div
              key={entry.id}
              className='grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_2rem] items-center gap-3 border-b py-3 sm:grid-cols-[minmax(0,1.6fr)_5rem_8rem_7.5rem_2rem]'
            >
              <div className='col-span-4 min-w-0 sm:col-span-1'>
                <p className='break-words text-sm font-medium'>{entry.itemName}</p>
                <p className='text-muted-foreground text-xs'>
                  {new Intl.DateTimeFormat('uk-UA', {
                    dateStyle: 'short',
                    timeStyle: 'short'
                  }).format(new Date(entry.createdAt))}{' '}
                  · {entry.actor.name}
                </p>
                {entry.note && (
                  <p className='text-muted-foreground text-xs break-words'>{entry.note}</p>
                )}
              </div>
              <p className='text-sm tabular-nums'>
                {entry.accountingMode === 'amount' ? (
                  '—'
                ) : (
                  <>
                    {stockQuantity(-entry.deltaMilli)} {entry.unit}
                  </>
                )}
              </p>
              <div className='text-sm tabular-nums'>
                <strong>
                  {entry.costDeltaCents === null ? 'Не визначена' : money(-entry.costDeltaCents)}
                </strong>
                {entry.accountingMode !== 'amount' && entry.costDeltaCents !== null && (
                  <p className='text-muted-foreground text-xs'>
                    {money(
                      roundedRatio(
                        BigInt(-entry.costDeltaCents) * BigInt(1000),
                        BigInt(-entry.deltaMilli)
                      )
                    )}
                    /{entry.unit}
                  </p>
                )}
              </div>
              <Badge variant='secondary' className='justify-self-end sm:justify-self-start'>
                {entry.category === 'polishing' ? 'Полірування' : 'Фарбування'}
              </Badge>
              {admin && editable ? (
                <Button
                  type='button'
                  size='icon-sm'
                  variant='ghost'
                  aria-label={`Редагувати списання: ${entry.itemName}`}
                  disabled={disabled}
                  className='justify-self-end'
                  onClick={() => setEditing(entry)}
                >
                  <Icons.edit />
                </Button>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      )}
      {admin && !editable && (
        <p className='text-muted-foreground text-sm'>
          Списання доступне в статусах «В роботі» та «Готово».
        </p>
      )}
      {children}
      {!!movements.length && (
        <details className='rounded-lg border p-3'>
          <summary className='cursor-pointer text-sm font-medium'>
            Журнал складських операцій
          </summary>
          <div className='pt-3'>
            <MovementHistory movements={movements} />
          </div>
        </details>
      )}
      {editing && (
        <ConsumptionDialog
          orderId={order.id}
          access={access}
          movement={editing === 'new' ? undefined : editing}
          items={data.items}
          onStateChange={onStateChange}
          onClose={() => {
            setEditing(null);
            onStateChange?.({ dirty: false, pending: false });
          }}
        />
      )}
    </section>
  );
}
export function OrderMaterials(props: {
  children?: ReactNode;
  order: RepairOrder;
  access: CrmAccess;
  onStateChange?: (state: FormState) => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <Suspense fallback={<Skeleton className='h-20 w-full' />}>
      <Materials {...props} />
    </Suspense>
  );
}
