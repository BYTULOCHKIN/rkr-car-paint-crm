import { mutationOptions, queryOptions } from '@tanstack/react-query';
import {
  createCustomer,
  createVehicle,
  createRequest,
  createOrder,
  updateOrder,
  updateVehicleVin,
  getWorkspace,
  updateWorkflow,
  getVehicleCatalog,
  decodeVehicleVin,
  assignVehicle,
  updateVehicle,
  deleteVehicle
} from './service';
import type { ActionResult } from './types';

function unwrap<T>(result: ActionResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

export const crmQueries = {
  catalog: (make: string) =>
    queryOptions({
      queryKey: ['vehicle-catalog', make],
      queryFn: () => getVehicleCatalog(make),
      staleTime: 86400000
    }),
  vin: (vin: string, year?: number) =>
    queryOptions({
      queryKey: ['vehicle-vin', vin, year],
      queryFn: () => decodeVehicleVin(vin, year),
      staleTime: 86400000,
      retry: false
    }),
  all: () => ['crm'] as const,
  workspace: (userId: string) =>
    queryOptions({
      queryKey: [...crmQueries.all(), userId, 'workspace'] as const,
      queryFn: () => getWorkspace()
    })
};

export const crmMutations = {
  updateVehicle: () =>
    mutationOptions({
      mutationFn: async (input: Parameters<typeof updateVehicle>[0]) =>
        unwrap(await updateVehicle(input))
    }),
  deleteVehicle: () =>
    mutationOptions({ mutationFn: async (id: string) => unwrap(await deleteVehicle(id)) }),
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
