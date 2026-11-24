'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ListPagination } from '@/features/crm/components/list-pagination';
import { inventoryQueries } from '../api/queries';
import type { StockMovement } from '../api/types';
import { MovementHistory } from './movement-history';

function MovementsPage({
  userId,
  orgId,
  itemId,
  orderId,
  onReverse
}: {
  userId: string;
  orgId: string;
  itemId?: string;
  orderId?: string;
  onReverse?: (movement: StockMovement) => void;
}) {
  const [page, setPage] = useState(1);
  const result = useQuery(inventoryQueries.movements(userId, orgId, { itemId, orderId, page }));
  if (result.isError)
    return (
      <div role='alert'>
        Не вдалося завантажити історію.{' '}
        <Button variant='outline' onClick={() => void result.refetch()}>
          Повторити
        </Button>
      </div>
    );
  if (!result.data) return <p role='status'>Завантажуємо операції…</p>;
  return (
    <div className='flex flex-col gap-3'>
      <MovementHistory movements={result.data.items} onReverse={onReverse} />
      <ListPagination {...result.data} pending={result.isFetching} onPage={setPage} />
    </div>
  );
}

export function PagedMovements(props: Parameters<typeof MovementsPage>[0]) {
  return (
    <MovementsPage key={`${props.orgId}:${props.itemId ?? ''}:${props.orderId ?? ''}`} {...props} />
  );
}
