'use client';

import { ComboboxField } from '@/components/forms/fields/combobox-field';
import type { Vehicle } from '../api/types';
import { vehicleLabel } from './format';

interface VehicleSelectProps {
  customerId: string;
  vehicles: Vehicle[];
  requireVin?: boolean;
}

export function VehicleSelect({ customerId, vehicles, requireVin = false }: VehicleSelectProps) {
  const owned = vehicles.filter((vehicle) => vehicle.customerId === customerId);
  const options = owned.map((vehicle) => ({
    value: vehicle.id,
    label: vehicleLabel(vehicle),
    description: [vehicle.year, vehicle.vin || 'VIN не додано'].filter(Boolean).join(' · '),
    disabled: requireVin && !vehicle.vin
  }));
  const emptyMessage = !customerId
    ? 'Спочатку виберіть клієнта.'
    : !owned.length
      ? 'У цього клієнта ще немає автомобілів. Додайте авто в розділі «Клієнти та авто».'
      : 'Немає автомобілів із VIN. Додайте VIN у розділі «Клієнти та авто».';
  return (
    <ComboboxField
      label='Автомобіль'
      required
      options={options}
      disabled={!customerId}
      placeholder={!customerId ? 'Спочатку виберіть клієнта' : 'Виберіть автомобіль'}
      searchPlaceholder='Марка, модель, номер або VIN…'
      emptyMessage={emptyMessage}
      description={
        customerId && requireVin
          ? 'Для замовлення VIN обов’язковий. Авто без VIN недоступні для вибору.'
          : undefined
      }
    />
  );
}
