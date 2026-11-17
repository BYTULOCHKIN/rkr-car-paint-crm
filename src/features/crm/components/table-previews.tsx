'use client';

import { TableCellPopover } from '@/components/data-table/table-cell-preview';
import { VehicleBrandAvatar } from '@/components/vehicle-brand-avatar';
import { Badge } from '@/components/ui/badge';
import type { RepairOrder, Vehicle } from '../api/types';
import { money, vehicleLabel } from './format';
import { Button } from './action-button';

export function OrderWorkPreview({ order }: { order: RepairOrder }) {
  return (
    <TableCellPopover
      label={`Роботи замовлення №${order.number}`}
      summary={
        <span className='flex min-w-0 flex-col'>
          <span className='truncate'>{order.description || 'Перелік робіт'}</span>
          <span className='text-xs text-muted-foreground'>Позицій: {order.items.length}</span>
        </span>
      }
    >
      <p className='whitespace-pre-wrap break-words [overflow-wrap:anywhere]'>
        {order.description}
      </p>
      <ul className='flex flex-col divide-y rounded-lg border px-3'>
        {order.items.map((item, index) => (
          <li key={index} className='flex items-start justify-between gap-3 py-3'>
            <div className='min-w-0'>
              <p className='break-words [overflow-wrap:anywhere] font-medium'>{item.description}</p>
              <p className='mt-1 text-xs text-muted-foreground'>
                {item.quantity} × {money(item.unitPriceCents)}
              </p>
            </div>
            <span className='shrink-0 tabular-nums'>
              {money(item.quantity * item.unitPriceCents)}
            </span>
          </li>
        ))}
      </ul>
      <p className='flex justify-between gap-3 border-t pt-3 font-semibold'>
        <span>Разом</span>
        <span className='tabular-nums'>{money(order.totalCents)}</span>
      </p>
    </TableCellPopover>
  );
}

export function CustomerCarsPreview({
  vehicles,
  onVin,
  onHistory
}: {
  vehicles: Vehicle[];
  onVin: (vehicle: Vehicle) => void;
  onHistory: () => void;
}) {
  if (!vehicles.length) return <span className='text-muted-foreground'>Ще немає автомобілів</span>;
  return (
    <TableCellPopover
      label='Автомобілі клієнта'
      summary={
        <span className='flex min-w-0 items-center gap-2'>
          <VehicleBrandAvatar make={vehicles[0].make} size='sm' />
          <span className='min-w-0'>
            <span className='block truncate'>{vehicleLabel(vehicles[0])}</span>
            <span className='block text-xs text-muted-foreground'>
              Автомобілів: {vehicles.length}
            </span>
          </span>
        </span>
      }
    >
      {(close) => (
        <>
          <ul className='flex flex-col divide-y'>
            {vehicles.map((vehicle) => (
              <li key={vehicle.id} className='flex items-start gap-3 py-3'>
                <VehicleBrandAvatar make={vehicle.make} />
                <div className='min-w-0 flex-1'>
                  <p className='break-words font-medium'>
                    {vehicle.make} {vehicle.model}
                  </p>
                  <div className='my-1 flex flex-wrap gap-1'>
                    <Badge variant='outline'>{vehicle.year ?? 'Рік не вказано'}</Badge>
                    <Badge variant='outline'>{vehicle.plate || 'Без номера'}</Badge>
                  </div>
                  {vehicle.vin ? (
                    <p className='break-all font-mono text-xs select-text'>{vehicle.vin}</p>
                  ) : (
                    <Button
                      size='xs'
                      variant='outline'
                      onClick={() => {
                        close();
                        onVin(vehicle);
                      }}
                    >
                      Додати VIN
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Button
            size='sm'
            variant='outline'
            onClick={() => {
              close();
              onHistory();
            }}
          >
            Повна історія автомобілів
          </Button>
        </>
      )}
    </TableCellPopover>
  );
}
