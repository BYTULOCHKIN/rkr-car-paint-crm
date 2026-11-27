'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type InventoryLayout = 'table' | 'cards';
const CHANGE_EVENT = 'crm-inventory-layout';
const fallback = new Map<string, InventoryLayout>();
const serverSnapshot = (): InventoryLayout => 'table';

/** A display preference, scoped to the member and organization rather than the list query. */
export function useInventoryLayout(
  userId: string,
  orgId: string
): readonly [InventoryLayout, (value: InventoryLayout) => void] {
  const key = `crm:inventory-layout:${orgId}:${userId}`;
  const subscribe = useCallback(
    (notify: () => void) => {
      function storageChanged(event: StorageEvent): void {
        if (event.key !== null && event.key !== key) return;
        fallback.delete(key);
        notify();
      }
      window.addEventListener('storage', storageChanged);
      window.addEventListener(CHANGE_EVENT, notify);
      return () => {
        window.removeEventListener('storage', storageChanged);
        window.removeEventListener(CHANGE_EVENT, notify);
      };
    },
    [key]
  );
  const getSnapshot = useCallback((): InventoryLayout => {
    const temporary = fallback.get(key);
    if (temporary) return temporary;
    try {
      return window.localStorage.getItem(key) === 'cards' ? 'cards' : 'table';
    } catch {
      return 'table';
    }
  }, [key]);
  const layout = useSyncExternalStore(subscribe, getSnapshot, serverSnapshot);
  const setLayout = useCallback(
    (value: InventoryLayout): void => {
      try {
        window.localStorage.setItem(key, value);
        fallback.delete(key);
      } catch {
        fallback.set(key, value);
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [key]
  );
  return [layout, setLayout] as const;
}
