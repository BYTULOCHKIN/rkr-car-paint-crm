'use client';

import { useLayoutEffect, useRef } from 'react';
import { useDebouncedCallback as useHookzDebouncedCallback } from '@react-hookz/web/useDebouncedCallback';

export function useDebouncedCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const callbackRef = useRef(callback);
  // Preserve the stable callback API and the latest committed consumer state.
  useLayoutEffect(() => {
    callbackRef.current = callback;
  });
  return useHookzDebouncedCallback(
    (...args: Parameters<T>) => callbackRef.current(...args),
    [callbackRef],
    delay
  );
}
