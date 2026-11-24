import { queryOptions, mutationOptions, keepPreviousData } from '@tanstack/react-query';
import { getInventoryItems } from './search-service';
import type { InventoryFilters } from './types';
import type { ActionResult } from '@/features/crm/api/types';
import {
  getInventory,
  createStockItem,
  updateStockItem,
  archiveStockItem,
  receiveStock,
  adjustStock,
  consumeStock,
  consumeStockBatch,
  reverseConsumption,
  valueStockBalance
} from './service';

function unwrap<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export const inventoryQueries = {
  all: () => ['inventory'] as const,
  items: (userId: string, orgId: string, filters: InventoryFilters) =>
    queryOptions({
      queryKey: [...inventoryQueries.all(), userId, orgId, 'items', filters] as const,
      queryFn: ({ signal }) => getInventoryItems(orgId, filters, signal),
      placeholderData: (previous, query) =>
        query?.queryKey[1] === userId && query.queryKey[2] === orgId
          ? keepPreviousData(previous)
          : undefined,
      staleTime: 0,
      refetchInterval: 30_000,
      retry: false
    }),
  workspace: (userId: string, orgId: string) =>
    queryOptions({
      queryKey: [...inventoryQueries.all(), userId, orgId] as const,
      queryFn: () => getInventory(orgId),
      staleTime: 0,
      refetchInterval: 30_000
    })
};
export const inventoryMutations = {
  consumeBatch: (orgId: string) =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof consumeStockBatch>[1]) =>
        unwrap(await consumeStockBatch(orgId, input))
    }),
  value: (orgId: string) =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof valueStockBalance>[1]) =>
        unwrap(await valueStockBalance(orgId, input))
    }),
  create: (orgId: string) =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof createStockItem>[1]) =>
        unwrap(await createStockItem(orgId, input))
    }),
  update: (orgId: string) =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof updateStockItem>[1]) =>
        unwrap(await updateStockItem(orgId, input))
    }),
  archive: (orgId: string) =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof archiveStockItem>[1]) =>
        unwrap(await archiveStockItem(orgId, input))
    }),
  receive: (orgId: string) =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof receiveStock>[1]) =>
        unwrap(await receiveStock(orgId, input))
    }),
  adjust: (orgId: string) =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof adjustStock>[1]) =>
        unwrap(await adjustStock(orgId, input))
    }),
  consume: (orgId: string) =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof consumeStock>[1]) =>
        unwrap(await consumeStock(orgId, input))
    }),
  reverse: (orgId: string) =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof reverseConsumption>[1]) =>
        unwrap(await reverseConsumption(orgId, input))
    })
};
