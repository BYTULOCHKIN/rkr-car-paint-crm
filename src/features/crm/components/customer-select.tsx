'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ComboboxField } from '@/components/forms/fields/combobox-field';
import { useFieldContext } from '@/lib/form-context';
import { useDebounce } from '@/hooks/use-debounce';
import { crmQueries } from '../api/queries';
import type { CrmWorkspace, Customer } from '../api/types';
import { matchesChoice } from '@/components/forms/fields/choice-options';
import { customerChoices } from './choice-options';

export function CustomerSelect({
  data,
  required = true,
  clearable,
  disabled,
  label = 'Клієнт',
  emptyMessage = 'Клієнтів ще немає. Спочатку додайте клієнта в розділі «Клієнти та авто».'
}: {
  data: CrmWorkspace;
  required?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  label?: string;
  emptyMessage?: string;
}) {
  const field = useFieldContext<string>();
  const [search, setSearch] = useState('');
  const query = useDebounce(search, 300);
  const result = useQuery({
    ...crmQueries.list(data.access?.userId ?? '', data.access?.orgId ?? '', {
      entity: 'customers',
      search: query,
      pageSize: 50,
      lookup: true
    }),
    enabled: !!data.serverRead
  });
  const [pinned, setPinned] = useState<Customer | undefined>(
    data.customers.find((row) => row.id === field.state.value)
  );
  const selected = [
    ...(result.data?.customers ?? []),
    ...data.customers,
    ...(pinned ? [pinned] : [])
  ].find((row) => row.id === field.state.value);
  const candidates = data.serverRead ? (result.data?.customers ?? []) : data.customers;
  const options = candidates;
  const emptyChoice = { value: '', label: 'Без клієнта' };
  return (
    <ComboboxField
      label={label}
      disabled={disabled}
      required={required}
      clearable={clearable}
      placeholder={required ? 'Виберіть клієнта' : 'Без клієнта'}
      searchPlaceholder='Ім’я або телефон…'
      options={[
        ...(!required && matchesChoice(emptyChoice, search) ? [emptyChoice] : []),
        ...customerChoices(options)
      ]}
      selectedOption={selected ? customerChoices([selected])[0] : undefined}
      onSearchChange={data.serverRead ? setSearch : undefined}
      onOptionChange={(option) => setPinned(options.find((row) => row.id === option?.value))}
      loading={result.isFetching}
      emptyMessage={query.trim() ? 'За цим пошуком нічого не знайдено.' : emptyMessage}
      errorMessage={result.isError ? 'Не вдалося завантажити клієнтів' : undefined}
      onRetry={() => void result.refetch()}
    />
  );
}
