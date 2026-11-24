import { apiClient } from '@/lib/api-client';
import type {
  InventoryFilters,
  InventoryItemsResponse,
  MovementFilters,
  StockMovement
} from './types';
import type { PageResult } from '@/features/crm/lib/pagination';

export function getInventoryItems(
  orgId: string,
  filters: InventoryFilters,
  signal?: AbortSignal
): Promise<InventoryItemsResponse> {
  const params = new URLSearchParams({
    orgId,
    search: filters.search,
    archived: String(filters.archived),
    page: String(filters.page ?? 1),
    pageSize: String(filters.pageSize ?? 50)
  });
  for (const tag of filters.tags) params.append('tag', tag);
  return apiClient<InventoryItemsResponse>(`/inventory/items?${params}`, {
    signal,
    cache: 'no-store'
  });
}

export function getInventoryMovements(
  orgId: string,
  filters: MovementFilters,
  signal?: AbortSignal
): Promise<PageResult<StockMovement>> {
  const params = new URLSearchParams({
    orgId,
    page: String(filters.page ?? 1),
    pageSize: String(filters.pageSize ?? 50)
  });
  if (filters.itemId) params.set('itemId', filters.itemId);
  if (filters.orderId) params.set('orderId', filters.orderId);
  return apiClient(`/inventory/movements?${params}`, { signal, cache: 'no-store' });
}

export async function getInventoryExport(
  orgId: string,
  filters: InventoryFilters
): Promise<import('./types').StockItem[]> {
  const items: import('./types').StockItem[] = [];
  let page = 1;
  while (true) {
    const result = await getInventoryItems(orgId, { ...filters, page, pageSize: 100 });
    items.push(...result.items);
    if (items.length >= result.total || !result.items.length) return items;
    page++;
  }
}
