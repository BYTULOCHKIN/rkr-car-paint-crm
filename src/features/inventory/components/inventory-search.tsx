'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';

interface InventorySearchProps {
  search: string;
  fetching: boolean;
  onSearch: (value: string) => void;
  onPendingChange: (pending: boolean) => void;
}

/** Keep keystrokes outside URL state and the warehouse table render. */
export function InventorySearch({
  search,
  fetching,
  onSearch,
  onPendingChange
}: InventorySearchProps) {
  const [value, setValue] = useState(search);
  const ownCommit = useRef<string | null>(null);
  const previousSearch = useRef(search);
  const generation = useRef(0);
  useEffect(() => {
    if (previousSearch.current === search) return;
    previousSearch.current = search;
    if (ownCommit.current === search) {
      ownCommit.current = null;
      return;
    }
    ownCommit.current = null;
    generation.current += 1;
    setValue(search);
    onPendingChange(false);
  }, [search, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  const update = useDebouncedCallback((query: string, version: number) => {
    if (generation.current !== version) return;
    if (query !== search) {
      ownCommit.current = query;
      onSearch(query);
    }
    onPendingChange(false);
  }, 300);
  return (
    <Input
      aria-label='Пошук складських позицій'
      aria-busy={value !== search || fetching}
      placeholder='Назва, примітка або тег…'
      value={value}
      maxLength={500}
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        onPendingChange(next !== search);
        update(next, generation.current);
      }}
      className='w-full sm:max-w-sm'
    />
  );
}
