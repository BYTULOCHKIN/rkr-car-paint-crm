'use client';

import type { ReactElement } from 'react';
import Link from 'next/link';
import { Icons } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Button } from '@/features/crm/components/action-button';
import { vehicleLabel } from '@/features/crm/components/format';
import type { CrmWorkspace, WorkflowRecord } from '@/features/crm/api/types';
import { displayDate, overdueLabel, statusLabel } from '@/features/crm/lib/workflow';

export interface QueueEntry {
  target: WorkflowRecord;
  date: string | null;
  label: string;
}

interface WorkQueueProps {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  entries: QueueEntry[];
  data: CrmWorkspace;
  today: string;
  onOpen: (target: WorkflowRecord) => void;
}

export function WorkQueue({
  title,
  description,
  entries,
  data,
  today,
  onOpen,
  emptyTitle,
  emptyDescription
}: WorkQueueProps): ReactElement {
  const customers = new Map(data.customers.map((customer) => [customer.id, customer]));
  const vehicles = new Map(data.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  return (
    <Card className='min-w-0'>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className='flex-1'>
        {entries.length ? (
          <ul className='divide-y'>
            {entries.slice(0, 5).map(({ target, date, label }) => {
              const customer = customers.get(target.record.customerId);
              const vehicle = vehicles.get(target.record.vehicleId);
              const overdue = overdueLabel(target, today);
              const name =
                target.kind === 'order' ? `Замовлення №${target.record.number}` : 'Заявка';
              return (
                <li
                  key={`${target.kind}-${target.record.id}`}
                  className='flex items-center gap-3 py-3 first:pt-0 last:pb-0'
                >
                  <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
                    <p
                      className='truncate text-sm font-medium'
                      title={`${name} · ${customer?.name ?? 'Клієнта не знайдено'}`}
                    >
                      {name} · {customer?.name ?? 'Клієнта не знайдено'}
                    </p>
                    <p
                      className='truncate text-xs text-muted-foreground'
                      title={vehicle ? vehicleLabel(vehicle) : undefined}
                    >
                      {vehicle ? vehicleLabel(vehicle) : 'Автомобіль не знайдено'}
                    </p>
                    <div className='flex flex-wrap items-center gap-2 text-xs'>
                      <Badge variant={overdue ? 'destructive' : 'secondary'}>
                        {overdue || statusLabel(target.record.status)}
                      </Badge>
                      <span className='text-muted-foreground'>
                        {label}
                        {date ? ` · ${displayDate(date)}` : ''}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant='outline'
                    size='icon-sm'
                    aria-label={`Статус і дати: ${name} · ${customer?.name ?? ''}`}
                    onClick={() => onOpen(target)}
                  >
                    <Icons.chevronRight />
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty className='min-h-48'>
            <EmptyHeader>
              <EmptyTitle>{emptyTitle}</EmptyTitle>
              <EmptyDescription>{emptyDescription}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
      <CardFooter className='flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground'>
        <span>
          {entries.length > 5 ? `Показано 5 із ${entries.length}` : `Записів: ${entries.length}`}
        </span>
        <Link href='/dashboard/kanban' className='underline underline-offset-4'>
          Переглянути дошку
        </Link>
      </CardFooter>
    </Card>
  );
}
