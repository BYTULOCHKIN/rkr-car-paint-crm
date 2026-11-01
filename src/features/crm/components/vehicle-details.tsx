'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DialogActions } from './dialog-form';
import { crmMutations, crmQueries } from '../api/queries';
import type { CrmWorkspace, Vehicle, RepairOrder } from '../api/types';
import { statusLabel, displayDate } from '../lib/workflow';
import { money, vehicleLabel } from './format';
import { FormStatus, type SaveProps } from './form-status';
import { Button } from './action-button';

interface VehicleDetailsProps {
  vehicle: Vehicle;
  data: CrmWorkspace;
  onSelectOrder: (order: RepairOrder) => void;
}
export function VehicleDetails({ vehicle, data, onSelectOrder }: VehicleDetailsProps) {
  const orders = data.orders.filter((order) => order.vehicleId === vehicle.id);
  const requests = data.requests.filter((request) => request.vehicleId === vehicle.id);
  const fields = [
    ['Автомобіль', vehicleLabel(vehicle)],
    ['Рік', vehicle.year ?? 'Не вказано'],
    ['VIN', vehicle.vin || 'Не вказано'],
    [
      'Клієнт',
      data.customers.find((customer) => customer.id === vehicle.customerId)?.name || 'Без клієнта'
    ]
  ];
  return (
    <div className='flex flex-col gap-5'>
      <dl className='grid grid-cols-2 gap-3'>
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt className='text-muted-foreground text-sm'>{label}</dt>
            <dd className='break-all font-medium'>{value}</dd>
          </div>
        ))}
      </dl>
      <section className='flex flex-col gap-2'>
        <h3 className='font-medium'>Замовлення ({orders.length})</h3>
        {orders.length ? (
          orders.map((order) => (
            <Button key={order.id} variant='outline' onClick={() => onSelectOrder(order)}>
              №{order.number} · {statusLabel(order.status)} · {money(order.totalCents)}
            </Button>
          ))
        ) : (
          <p className='text-muted-foreground text-sm'>Замовлень ще немає.</p>
        )}
      </section>
      <section className='flex flex-col gap-2'>
        <h3 className='font-medium'>Заявки ({requests.length})</h3>
        {requests.length ? (
          requests.map((request) => (
            <div key={request.id} className='rounded-lg border p-3 text-sm'>
              <p>{request.description}</p>
              <p className='text-muted-foreground'>
                {statusLabel(request.status)} · Прийом: {displayDate(request.plannedIntakeDate)}
              </p>
            </div>
          ))
        ) : (
          <p className='text-muted-foreground text-sm'>Заявок ще немає.</p>
        )}
      </section>
    </div>
  );
}

export function DeleteVehicle({
  vehicle,
  onSaved,
  onCancel,
  onStateChange
}: SaveProps & { vehicle: Vehicle }) {
  const client = useQueryClient();
  const mutation = useMutation({
    ...crmMutations.deleteVehicle(),
    onSuccess: () => {
      toast.success('Автомобіль видалено');
      onSaved();
    },
    onSettled: () => client.invalidateQueries({ queryKey: crmQueries.all() })
  });
  return (
    <div className='flex flex-col gap-4'>
      <FormStatus dirty={false} pending={mutation.isPending} onChange={onStateChange} />
      <p>
        Видалити {vehicleLabel(vehicle)}
        {vehicle.year ? ` (${vehicle.year})` : ''}? Цю дію не можна скасувати.
      </p>
      {mutation.error && (
        <Alert variant='destructive'>
          <AlertDescription>{mutation.error.message}</AlertDescription>
        </Alert>
      )}
      <DialogActions>
        <Button variant='outline' onClick={onCancel} disabled={mutation.isPending}>
          Скасувати
        </Button>
        <Button
          variant='destructive'
          isLoading={mutation.isPending}
          onClick={() => mutation.mutate(vehicle.id)}
        >
          Видалити автомобіль
        </Button>
      </DialogActions>
    </div>
  );
}
