import { queryOptions, mutationOptions, keepPreviousData } from '@tanstack/react-query';
import { getInventoryItems, getInventoryMovements } from './search-service';
import type { InventoryFilters, MovementFilters } from './types';
import type { ActionResult } from '@/features/crm/api/types';
import {
  getInventory,
  getInventoryAccess,
  getOrderInventory,
  editConsumption,
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
  access: (userId: string, orgId: string) =>
    queryOptions({
      queryKey: ['inventory', userId, orgId, 'access'] as const,
      queryFn: () => getInventoryAccess(orgId)
    }),
  order: (userId: string, orgId: string, orderId: string) =>
    queryOptions({
      queryKey: ['inventory', userId, orgId, 'order', orderId] as const,
      queryFn: () => getOrderInventory(orgId, orderId),
      staleTime: 0
    }),
  movements: (userId: string, orgId: string, filters: MovementFilters) =>
    queryOptions({
      queryKey: ['inventory', userId, orgId, 'movements', filters] as const,
      queryFn: ({ signal }) => getInventoryMovements(orgId, filters, signal),
      staleTime: 0,
      retry: false
    }),
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
  saveConsumption: (orgId: string, movementId?: string) =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof consumeStock>[1]) =>
        unwrap(
          movementId
            ? await editConsumption(orgId, { ...input, movementId })
            : await consumeStock(orgId, input)
        )
    }),
  editConsumption: (orgId: string) =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof editConsumption>[1]) =>
        unwrap(await editConsumption(orgId, input))
    }),
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
