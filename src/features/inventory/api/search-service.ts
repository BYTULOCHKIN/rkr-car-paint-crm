import { apiClient } from '@/lib/api-client';
import type { InventoryFilters, InventoryItemsResponse } from './types';

export function getInventoryItems(
  orgId: string,
  filters: InventoryFilters,
  signal?: AbortSignal
): Promise<InventoryItemsResponse> {
  const params = new URLSearchParams({
    orgId,
    search: filters.search,
    archived: String(filters.archived)
  });
  for (const tag of filters.tags) params.append('tag', tag);
  return apiClient<InventoryItemsResponse>(`/inventory/items?${params}`, {
    signal,
    cache: 'no-store'
  });
}
