'use client';

import { useState } from 'react';
import { StatusBadge } from './status-badge';
import { HistoryBadge as Badge } from './history-badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Icons } from '@/components/icons';
import type { RepairOrder } from '../api/types';
import { money } from './format';
import { displayDate } from '../lib/workflow';

interface VehicleOrderHistoryProps {
  orders: RepairOrder[];
  onSelectOrder: (order: RepairOrder) => void;
}

export function VehicleOrderHistory({ orders, onSelectOrder }: VehicleOrderHistoryProps) {
  const [visible, setVisible] = useState(5);
  return (
    <section className='flex min-w-0 flex-col gap-3' aria-label='Замовлення автомобіля'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='font-semibold'>Історія замовлень</h3>
        <Badge>{orders.length}</Badge>
      </div>
      {orders.length ? (
        <>
          <ol className='flex flex-col gap-3'>
            {orders.slice(0, visible).map((order) => (
              <li key={order.id}>
                <Button
                  type='button'
                  variant='outline'
                  className='h-auto w-full justify-start p-4 text-left whitespace-normal'
                  aria-label={`Відкрити замовлення №${order.number}`}
                  onClick={() => onSelectOrder(order)}
                >
                  <span className='flex min-w-0 flex-1 flex-col gap-3'>
                    <span className='flex flex-wrap items-center justify-between gap-2'>
                      <span className='flex flex-wrap items-center gap-2'>
                        <span className='font-semibold'>№{order.number}</span>
                        <StatusBadge status={order.status} />
                      </span>
                      <span className='flex items-center gap-2 font-semibold tabular-nums'>
                        {money(order.totalCents)}
                        <Icons.chevronRight aria-hidden />
                      </span>
                    </span>
                    <span className='text-muted-foreground line-clamp-2 break-words text-sm'>
                      {order.description}
                    </span>
                    <span className='text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs'>
                      <span>Створено: {displayDate(order.createdAt.slice(0, 10))}</span>
                      {order.actualIntakeDate && (
                        <span>Прийнято: {displayDate(order.actualIntakeDate)}</span>
                      )}
                      {order.actualDeliveryDate ? (
                        <span>Видано: {displayDate(order.actualDeliveryDate)}</span>
                      ) : order.plannedDeliveryDate ? (
                        <span>Видача · план: {displayDate(order.plannedDeliveryDate)}</span>
                      ) : null}
                    </span>
                  </span>
                </Button>
              </li>
            ))}
          </ol>
          {visible < orders.length && (
            <Button
              type='button'
              variant='outline'
              onClick={() => setVisible((count) => count + 5)}
            >
              Показати ще {Math.min(5, orders.length - visible)}
            </Button>
          )}
        </>
      ) : (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyTitle>Замовлень ще немає</EmptyTitle>
            <EmptyDescription>
              Для цього автомобіля ще не створено жодного замовлення.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}
