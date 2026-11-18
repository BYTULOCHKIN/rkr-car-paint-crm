'use client';

import { useState, useTransition } from 'react';
import { Icons } from '@/components/icons';
import { Input } from '@/components/ui/input';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';

interface BoardSearchProps {
  search: string;
  onSearch: (value: string) => void;
}

/** Keystrokes update only this small component, never the Kanban drag-and-drop tree. */
export function BoardSearch({ search, onSearch }: BoardSearchProps) {
  const [value, setValue] = useState(search);
  const [isPending, startTransition] = useTransition();
  const update = useDebouncedCallback((query: string) => {
    startTransition(() => onSearch(query));
  }, 250);
  const busy = value !== search || isPending;
  return (
    <div className='relative w-full sm:max-w-sm'>
      <Input
        className='pr-9'
        aria-label='Пошук на дошці'
        aria-busy={busy}
        type='search'
        autoComplete='off'
        placeholder='Клієнт, автомобіль, VIN…'
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          update(event.target.value);
        }}
      />
      {busy && (
        <Icons.spinner
          role='status'
          aria-label='Оновлення пошуку'
          className='text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 motion-safe:animate-spin'
        />
      )}
    </div>
  );
}
