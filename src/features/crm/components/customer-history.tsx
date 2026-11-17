'use client';

import { useId, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CustomerContacts } from './customer-contacts';
import { PersonAvatar } from '@/components/person-avatar';
import { VehicleBrandAvatar } from '@/components/vehicle-brand-avatar';
import { HistoryBadge as Badge } from './history-badge';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem
} from '@/components/ui/select';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { Icons } from '@/components/icons';
import type { CrmWorkspace, Customer, RepairOrder, Vehicle } from '../api/types';
import { customerVehicleHistory } from '../lib/customer-history';
import { money, vehicleLabel } from './format';
import { VehicleOrderHistory } from './vehicle-order-history';

interface CustomerHistoryProps {
  customer: Customer;
  data: CrmWorkspace;
  initialVehicleId?: string;
  onSelectOrder: (order: RepairOrder) => void;
}

function choiceLabel(vehicle: Vehicle): string {
  return `${vehicleLabel(vehicle)}${vehicle.year ? ` · ${vehicle.year}` : ''}${vehicle.vin ? ` · ${vehicle.vin}` : ''}`;
}

export function CustomerHistory({
  customer,
  data,
  initialVehicleId,
  onSelectOrder
}: CustomerHistoryProps) {
  const entries = useMemo(() => customerVehicleHistory(data, customer.id), [data, customer.id]);
  const [selectedId, setSelectedId] = useState(initialVehicleId ?? entries[0]?.vehicle.id ?? '');
  const selected = entries.find((entry) => entry.vehicle.id === selectedId) ?? entries[0];
  const controlId = useId();
  const orderCount = entries.reduce((sum, entry) => sum + entry.orders.length, 0);
  const options = entries.map(({ vehicle }) => ({
    value: vehicle.id,
    label: choiceLabel(vehicle)
  }));
  async function copyVin(): Promise<void> {
    if (!selected?.vehicle.vin) return;
    try {
      await navigator.clipboard.writeText(selected.vehicle.vin);
      toast.success('VIN скопійовано');
    } catch {
      toast.error('Не вдалося скопіювати VIN. Виділіть і скопіюйте його вручну.');
    }
  }
  return (
    <div className='flex min-w-0 flex-col gap-5'>
      <section
        className='flex min-w-0 flex-col gap-3 rounded-xl border bg-muted/20 p-4'
        aria-label='Контакти клієнта'
      >
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='flex min-w-0 items-center gap-3'>
            <PersonAvatar identity={`customer:${customer.id}`} name={customer.name} size='lg' />
            <div className='flex min-w-0 flex-col gap-1'>
              <p className='font-semibold break-words'>{customer.name}</p>
              <CustomerContacts customer={customer} />
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Badge>Автомобілі: {entries.length}</Badge>
            <Badge>Замовлення: {orderCount}</Badge>
          </div>
        </div>
        {customer.notes && (
          <details className='text-sm'>
            <summary className='text-muted-foreground w-fit cursor-pointer'>
              Нотатки клієнта
            </summary>
            <p className='mt-2 break-words whitespace-pre-wrap'>{customer.notes}</p>
          </details>
        )}
      </section>
      {selected ? (
        <>
          <Field className='md:hidden'>
            <FieldLabel htmlFor={controlId}>Автомобіль клієнта</FieldLabel>
            <Select
              items={options}
              value={selected.vehicle.id}
              onValueChange={(value) => {
                if (value) setSelectedId(value);
              }}
            >
              <SelectTrigger id={controlId} className='w-full min-w-0'>
                <SelectValue className='truncate' />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} className='max-h-72'>
                <SelectGroup>
                  {options.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      className='whitespace-normal break-words'
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <div className='grid min-w-0 items-start gap-5 md:grid-cols-[260px_minmax(0,1fr)]'>
            <nav
              aria-label='Автомобілі клієнта'
              className='hidden min-w-0 scroll-py-1 flex-col gap-2 overflow-y-auto overscroll-contain p-1 md:sticky md:top-0 md:flex md:max-h-[50dvh]'
            >
              <h3 className='mb-1 text-sm font-medium text-muted-foreground'>Автомобілі клієнта</h3>
              {entries.map(({ vehicle, orders, activeCount }) => (
                <Button
                  key={vehicle.id}
                  type='button'
                  variant='outline'
                  aria-pressed={vehicle.id === selected.vehicle.id}
                  aria-label={`Обрати автомобіль ${choiceLabel(vehicle)}`}
                  onClick={() => setSelectedId(vehicle.id)}
                  className={cn(
                    'h-auto w-full min-w-0 justify-start rounded-xl border p-4 text-left whitespace-normal',
                    vehicle.id === selected.vehicle.id
                      ? 'border-primary bg-accent text-accent-foreground ring-1 ring-primary/30'
                      : 'border-border bg-background'
                  )}
                >
                  <span className='flex min-w-0 flex-1 flex-col gap-3'>
                    <span className='flex items-start justify-between gap-2'>
                      <VehicleBrandAvatar make={vehicle.make} size='sm' />
                      <span className='min-w-0 flex-1 text-sm leading-5 font-semibold break-words'>
                        {vehicle.make} {vehicle.model}
                      </span>
                      {vehicle.id === selected.vehicle.id && (
                        <Icons.check className='size-4 shrink-0 text-primary' aria-hidden />
                      )}
                    </span>
                    <span className='text-xs text-muted-foreground'>
                      {vehicle.year ?? 'Рік не вказано'} · {vehicle.plate || 'Без номера'}
                    </span>
                    <span className='flex flex-col gap-1 border-t border-border/70 pt-2'>
                      <span className='text-[11px] font-normal text-muted-foreground'>VIN</span>
                      <span className='font-mono text-xs leading-5 break-all text-foreground'>
                        {vehicle.vin || 'VIN не додано'}
                      </span>
                    </span>
                    <span className='flex flex-wrap gap-2'>
                      <Badge>Замовлень: {orders.length}</Badge>
                      {activeCount > 0 && <Badge tone='warning'>Активних: {activeCount}</Badge>}
                    </span>
                  </span>
                </Button>
              ))}
            </nav>
            <section
              className='flex min-w-0 flex-col gap-5'
              aria-label='Історія вибраного автомобіля'
            >
              <div className='flex min-w-0 flex-col gap-4 rounded-xl border p-4'>
                <div className='flex items-start gap-3'>
                  <VehicleBrandAvatar make={selected.vehicle.make} size='lg' />
                  <div className='flex min-w-0 flex-col gap-2'>
                    <h3 className='text-lg leading-snug font-semibold break-words'>
                      {selected.vehicle.make} {selected.vehicle.model}
                    </h3>
                    <div className='flex flex-wrap gap-2'>
                      <Badge>
                        {selected.vehicle.year ? `${selected.vehicle.year} р.` : 'Рік не вказано'}
                      </Badge>
                      <Badge>{selected.vehicle.plate || 'Номер не вказано'}</Badge>
                    </div>
                  </div>
                </div>
                <div className='flex min-w-0 items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2'>
                  <div className='min-w-0'>
                    <p className='text-xs text-muted-foreground'>VIN</p>
                    <p className='font-mono text-sm break-all select-text'>
                      {selected.vehicle.vin || 'VIN ще не додано'}
                    </p>
                  </div>
                  {selected.vehicle.vin && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-sm'
                      aria-label='Скопіювати VIN'
                      onClick={() => void copyVin()}
                    >
                      <Icons.copy aria-hidden />
                    </Button>
                  )}
                </div>
                <dl className='grid grid-cols-2 gap-3 border-t pt-3 text-sm'>
                  <div>
                    <dt className='text-muted-foreground'>Активних замовлень</dt>
                    <dd className='mt-1 font-semibold tabular-nums'>{selected.activeCount}</dd>
                  </div>
                  <div>
                    <dt className='text-muted-foreground'>Вартість замовлень</dt>
                    <dd className='mt-1 font-semibold tabular-nums'>
                      {money(selected.totalCents)}
                    </dd>
                  </div>
                </dl>
              </div>
              <VehicleOrderHistory
                key={selected.vehicle.id}
                orders={selected.orders}
                onSelectOrder={onSelectOrder}
              />
            </section>
          </div>
        </>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Автомобілів ще немає</EmptyTitle>
            <EmptyDescription>Додайте перший автомобіль у рядку клієнта.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
