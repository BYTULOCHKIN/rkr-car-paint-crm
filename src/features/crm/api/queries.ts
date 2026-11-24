import { mutationOptions, queryOptions, infiniteQueryOptions } from '@tanstack/react-query';
import {
  getOrderTrash,
  changeOrderTrash,
  createCustomer,
  updateCustomer,
  receivePayment,
  reversePayment,
  refundPayment,
  addVehicleModel,
  createVehicle,
  createRequest,
  createOrder,
  updateOrder,
  updateVehicleVin,
  getWorkspace,
  getTeam,
  updateTeamMember,
  advanceOrder,
  updateWorkflow,
  getVehicleCatalog,
  decodeVehicleVin,
  assignVehicle,
  updateVehicle,
  deleteVehicle
} from './service';
import type { ActionResult } from './types';
import { getCrmList, getCrmDetail } from './read-service';
import type { CrmListFilters } from '../schemas/reads';

function unwrap<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export const crmQueries = {
  board: (userId: string, orgId: string, search: string) =>
    infiniteQueryOptions({
      queryKey: ['crm', userId, orgId, 'board', search] as const,
      initialPageParam: 1,
      queryFn: ({ pageParam, signal }) =>
        getCrmList(orgId, { entity: 'kanban', search, page: pageParam, pageSize: 25 }, signal),
      placeholderData: (previous, query) =>
        query?.queryKey[1] === userId && query.queryKey[2] === orgId ? previous : undefined,
      getNextPageParam: (last) =>
        last.pagination &&
        last.pagination.page * last.pagination.pageSize <
          Math.max(0, ...Object.values(last.boardCounts ?? {}))
          ? last.pagination.page + 1
          : undefined
    }),
  list: (userId: string, orgId: string, filters: CrmListFilters) =>
    queryOptions({
      queryKey: ['crm', userId, orgId, 'list', filters] as const,
      queryFn: ({ signal }) => getCrmList(orgId, filters, signal),
      placeholderData: (previous, query) =>
        query?.queryKey[1] === userId && query.queryKey[2] === orgId ? previous : undefined,
      retry: false
    }),
  detail: (
    userId: string,
    orgId: string,
    id: string,
    kind: 'order' | 'history' = 'order',
    entity: 'order' | 'customer' | 'vehicle' | 'request' = 'order'
  ) =>
    queryOptions({
      queryKey: ['crm', userId, orgId, 'detail', kind, entity, id] as const,
      queryFn: ({ signal }) => getCrmDetail(orgId, kind, id, entity, signal),
      staleTime: 0,
      retry: false
    }),
  trash: (userId: string, orgId: string) =>
    queryOptions({
      queryKey: ['crm', userId, orgId, 'trash'] as const,
      queryFn: () => getOrderTrash(orgId),
      staleTime: 0
    }),
  catalog: (make: string, orgId?: string) =>
    queryOptions({
      queryKey: ['vehicle-catalog', orgId ?? 'legacy', make],
      queryFn: () => getVehicleCatalog(make, orgId),
      staleTime: 86400000
    }),
  vin: (vin: string, year?: number) =>
    queryOptions({
      queryKey: ['vehicle-vin', vin, year],
      queryFn: () => decodeVehicleVin(vin, year),
      staleTime: 86400000,
      retry: false
    }),
  team: (userId: string, orgId: string) =>
    queryOptions({
      queryKey: ['crm', userId, orgId, 'team'] as const,
      queryFn: () => getTeam(orgId),
      staleTime: 0,
      refetchInterval: 30_000
    }),
  all: () => ['crm'] as const,
  workspace: (userId: string, orgId?: string | null) =>
    queryOptions({
      queryKey: [...crmQueries.all(), userId, orgId ?? 'legacy', 'workspace'] as const,
      queryFn: () => getWorkspace(orgId)
    })
};

export const crmMutations = {
  trash: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof changeOrderTrash>[0]) =>
        unwrap(await changeOrderTrash(input))
    }),
  updateTeamMember: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof updateTeamMember>[0]) =>
        unwrap(await updateTeamMember(input))
    }),
  refundPayment: () =>
    mutationOptions({
      mutationFn: async ({
        orgId,
        input
      }: {
        orgId: string;
        input: Parameters<typeof refundPayment>[1];
      }) => unwrap(await refundPayment(orgId, input))
    }),
  updateCustomer: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof updateCustomer>[0]) =>
        unwrap(await updateCustomer(input))
    }),
  receivePayment: () =>
    mutationOptions({
      mutationFn: async ({
        orgId,
        input
      }: {
        orgId: string;
        input: Parameters<typeof receivePayment>[1];
      }) => unwrap(await receivePayment(orgId, input))
    }),
  reversePayment: () =>
    mutationOptions({
      mutationFn: async ({
        orgId,
        input
      }: {
        orgId: string;
        input: Parameters<typeof reversePayment>[1];
      }) => unwrap(await reversePayment(orgId, input))
    }),
  vehicleModel: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof addVehicleModel>[0]) =>
        unwrap(await addVehicleModel(input))
    }),
  advance: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof advanceOrder>[0]) =>
        unwrap(await advanceOrder(input))
    }),
  updateVehicle: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof updateVehicle>[0]) =>
        unwrap(await updateVehicle(input))
    }),
  deleteVehicle: () =>
    mutationOptions({
      mutationFn: async (id: string) => unwrap(await deleteVehicle(id))
    }),
  assignVehicle: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof assignVehicle>[0]) =>
        unwrap(await assignVehicle(input))
    }),
  workflow: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof updateWorkflow>[0]) =>
        unwrap(await updateWorkflow(input))
    }),
  customer: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof createCustomer>[0]) =>
        unwrap(await createCustomer(input))
    }),
  vehicle: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof createVehicle>[0]) =>
        unwrap(await createVehicle(input))
    }),
  request: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof createRequest>[0]) =>
        unwrap(await createRequest(input))
    }),
  order: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof createOrder>[0]) =>
        unwrap(await createOrder(input))
    }),
  updateOrder: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof updateOrder>[0]) =>
        unwrap(await updateOrder(input))
    }),
  vin: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof updateVehicleVin>[0]) =>
        unwrap(await updateVehicleVin(input))
    })
};
