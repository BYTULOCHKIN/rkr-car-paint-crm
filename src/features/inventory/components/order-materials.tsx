'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { RepairOrder, CrmAccess } from '@/features/crm/api/types';
import { inventoryQueries } from '../api/queries';
import { StockOperationForm, StockReversalForm } from './stock-forms';
import { MovementHistory } from './movement-history';
import type { StockMovement } from '../api/types';
import { stockQuantity } from '../lib/format';

function Materials({
  order,
  access,
  onPendingChange
}: {
  order: RepairOrder;
  access: CrmAccess;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { data } = useSuspenseQuery(inventoryQueries.workspace(access.userId, access.orgId));
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    onPendingChange?.(pending);
    return () => onPendingChange?.(false);
  }, [pending, onPendingChange]);
  const [reversing, setReversing] = useState<StockMovement | null>(null);
  const movements = data.movements.filter((movement) => movement.orderId === order.id);
  const admin = access.role === 'admin' && data.access.role === 'admin';
  const totals = new Map<string, { name: string; unit: string; quantity: number }>();
  for (const movement of movements) {
    const entry = totals.get(movement.itemId) ?? {
      name: movement.itemName,
      unit: movement.unit,
      quantity: 0
    };
    entry.quantity -= movement.deltaMilli;
    totals.set(movement.itemId, entry);
  }
  return (
    <section
      className='flex flex-col gap-3 rounded-lg border p-4'
      aria-label='Матеріали замовлення'
    >
      <h3 className='font-semibold'>Матеріали</h3>
      <p className='text-muted-foreground text-sm'>
        Внутрішні витрати. Не змінюють суму замовлення та не потрапляють у PDF.
      </p>
      {[...totals]
        .filter(([, entry]) => entry.quantity > 0)
        .map(([id, entry]) => (
          <p key={id} className='text-sm break-words'>
            {entry.name} — {stockQuantity(entry.quantity)} {entry.unit}
          </p>
        ))}
      {admin && order.status === 'in_progress' && !adding && !reversing && (
        <Button
          type='button'
          variant='outline'
          className='self-start'
          onClick={() => setAdding(true)}
        >
          Додати списання
        </Button>
      )}
      {admin && order.status !== 'in_progress' && (
        <p className='text-muted-foreground text-sm'>
          Нове списання доступне лише в статусі «В роботі».
        </p>
      )}
      {adding && order.status === 'in_progress' && (
        <div className='flex flex-col gap-3'>
          <StockOperationForm
            orgId={access.orgId}
            kind='consumption'
            items={data.items}
            orderId={order.id}
            onPendingChange={setPending}
            onSaved={() => setAdding(false)}
          />
          <Button type='button' variant='ghost' disabled={pending} onClick={() => setAdding(false)}>
            Закрити форму списання
          </Button>
        </div>
      )}
      {reversing && (
        <div className='flex flex-col gap-3'>
          <StockReversalForm
            orgId={access.orgId}
            movement={reversing}
            onPendingChange={setPending}
            onSaved={() => setReversing(null)}
          />
          <Button
            type='button'
            variant='ghost'
            disabled={pending}
            onClick={() => setReversing(null)}
          >
            Закрити скасування
          </Button>
        </div>
      )}
      <MovementHistory
        movements={movements}
        onReverse={admin && !adding && !reversing ? setReversing : undefined}
      />
    </section>
  );
}

export function OrderMaterials(props: {
  order: RepairOrder;
  access: CrmAccess;
  onPendingChange?: (pending: boolean) => void;
}) {
  return (
    <Suspense fallback={<Skeleton className='h-20 w-full' />}>
      <Materials {...props} />
    </Suspense>
  );
}
