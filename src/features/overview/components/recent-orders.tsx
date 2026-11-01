'use client';

import type { ReactElement } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Button } from '@/features/crm/components/action-button';
import { money, vehicleLabel } from '@/features/crm/components/format';
import type { CrmWorkspace, RepairOrder } from '@/features/crm/api/types';
import { statusLabel } from '@/features/crm/lib/workflow';

interface RecentOrdersProps {
  orders: RepairOrder[];
  data: CrmWorkspace;
  onOpen: (order: RepairOrder) => void;
}

export function RecentOrders({ orders, data, onOpen }: RecentOrdersProps): ReactElement {
  return (
    <Card className='min-w-0'>
      <CardHeader>
        <CardTitle>Останні замовлення</CardTitle>
        <CardDescription>П’ять останніх за датою створення</CardDescription>
      </CardHeader>
      <CardContent className='min-w-0'>
        {orders.length ? (
          <Table aria-label='Останні замовлення' className='min-w-[44rem]'>
            <TableHeader>
              <TableRow>
                <TableHead>Замовлення</TableHead>
                <TableHead>Клієнт та автомобіль</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Створено</TableHead>
                <TableHead className='text-right'>Вартість</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const customer = data.customers.find((entry) => entry.id === order.customerId);
                const vehicle = data.vehicles.find((entry) => entry.id === order.vehicleId);
                return (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Button
                        variant='link'
                        size='sm'
                        className='px-0'
                        aria-label={`Відкрити замовлення №${order.number}`}
                        onClick={() => onOpen(order)}
                      >
                        №{order.number}
                      </Button>
                    </TableCell>
                    <TableCell className='max-w-72'>
                      <p className='truncate font-medium' title={customer?.name}>
                        {customer?.name ?? 'Клієнта не знайдено'}
                      </p>
                      <p
                        className='truncate text-xs text-muted-foreground'
                        title={vehicle ? vehicleLabel(vehicle) : undefined}
                      >
                        {vehicle ? vehicleLabel(vehicle) : 'Автомобіль не знайдено'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant='secondary'>{statusLabel(order.status)}</Badge>
                    </TableCell>
                    <TableCell className='text-muted-foreground'>
                      {new Intl.DateTimeFormat('uk-UA', {
                        timeZone: 'Europe/Kyiv',
                        dateStyle: 'short'
                      }).format(new Date(order.createdAt))}
                    </TableCell>
                    <TableCell className='text-right font-medium tabular-nums'>
                      {money(order.totalCents)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Замовлень поки немає</EmptyTitle>
              <EmptyDescription>
                Візьміть заявку в роботу або створіть замовлення напряму.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
      <CardFooter>
        <Link href='/dashboard/orders' className='text-sm underline underline-offset-4'>
          Усі замовлення
        </Link>
      </CardFooter>
    </Card>
  );
}
