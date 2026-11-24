'use client';

import { useState } from 'react';
import { useDebouncedEffect } from '@react-hookz/web/useDebouncedEffect';

export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useDebouncedEffect(() => setDebouncedValue(value), [value, delay], delay);

  return debouncedValue;
}
