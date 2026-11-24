'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useDebouncedCallback } from '@/hooks/use-debounced-callback';

export interface DebouncedSearchProps {
  search: string;
  fetching?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
  onSearch: (value: string) => void;
  onPendingChange?: (pending: boolean) => void;
}

const NOOP = () => {};

/** Keep keystrokes outside URL state and the list render. */
export function DebouncedSearch({
  search,
  fetching = false,
  label = 'Пошук складських позицій',
  placeholder = 'Назва, примітка або тег…',
  className = 'w-full sm:max-w-sm',
  onSearch,
  onPendingChange = NOOP
}: DebouncedSearchProps) {
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
      aria-label={label}
      aria-busy={value !== search || fetching}
      placeholder={placeholder}
      value={value}
      maxLength={500}
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        onPendingChange(next !== search);
        update(next, generation.current);
      }}
      className={className}
    />
  );
}
