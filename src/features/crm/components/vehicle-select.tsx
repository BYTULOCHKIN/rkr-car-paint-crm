'use client';

import { ComboboxField } from '@/components/forms/fields/combobox-field';
import type { Vehicle } from '../api/types';
import { vehicleLabel } from './format';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/use-debounce';
import { crmQueries } from '../api/queries';
import type { CrmAccess } from '../api/types';
import { useFieldContext } from '@/lib/form-context';

interface VehicleSelectProps {
  customerId: string;
  vehicles: Vehicle[];
  requireVin?: boolean;
  access?: CrmAccess;
  serverRead?: boolean;
}

export function VehicleSelect({
  customerId,
  vehicles,
  requireVin = false,
  access,
  serverRead
}: VehicleSelectProps) {
  const field = useFieldContext<string>();
  const [pinned, setPinned] = useState<Vehicle | undefined>(
    vehicles.find((vehicle) => vehicle.id === field.state.value)
  );
  const [search, setSearch] = useState('');
  const query = useDebounce(search, 300);
  const result = useQuery({
    ...crmQueries.list(access?.userId ?? '', access?.orgId ?? '', {
      entity: 'vehicles',
      customerId: customerId || undefined,
      search: query,
      pageSize: 50,
      lookup: true
    }),
    enabled: !!serverRead && !!customerId
  });
  const candidates = (serverRead ? (result.data?.vehicles ?? []) : vehicles).filter(
    (vehicle) => vehicle.customerId === customerId
  );
  const selected = [...candidates, ...vehicles, ...(pinned ? [pinned] : [])].find(
    (vehicle) => vehicle.id === field.state.value && vehicle.customerId === customerId
  );
  const owned = candidates;
  const options = owned.map((vehicle) => ({
    value: vehicle.id,
    label: vehicleLabel(vehicle),
    description: [vehicle.year, vehicle.vin || 'VIN не додано'].filter(Boolean).join(' · '),
    disabled: requireVin && !vehicle.vin
  }));
  const emptyMessage = !customerId
    ? 'Спочатку виберіть клієнта.'
    : query.trim()
      ? 'За цим пошуком нічого не знайдено.'
      : !owned.length
        ? 'У цього клієнта ще немає автомобілів. Додайте авто в розділі «Клієнти та авто».'
        : 'Немає автомобілів із VIN. Додайте VIN у розділі «Клієнти та авто».';
  return (
    <ComboboxField
      label='Автомобіль'
      required
      options={options}
      selectedOption={
        selected
          ? {
              value: selected.id,
              label: vehicleLabel(selected),
              description: [selected.year, selected.vin || 'VIN не додано']
                .filter(Boolean)
                .join(' · ')
            }
          : undefined
      }
      onSearchChange={serverRead ? setSearch : undefined}
      onOptionChange={(option) => setPinned(owned.find((vehicle) => vehicle.id === option?.value))}
      loading={result.isFetching}
      errorMessage={result.isError ? 'Не вдалося завантажити автомобілі' : undefined}
      onRetry={() => void result.refetch()}
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
