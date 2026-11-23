import { isCompletedStatus } from '@/features/crm/lib/workflow';
import type { CrmWorkspace, RepairOrder, Vehicle } from '../api/types';

export interface VehicleHistoryEntry {
  vehicle: Vehicle;
  orders: RepairOrder[];
  activeCount: number;
  totalCents: number;
}

export function vehicleOrders(orders: RepairOrder[], vehicleId: string): RepairOrder[] {
  return orders
    .filter((order) => order.vehicleId === vehicleId)
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt) || b.number - a.number);
}

export function customerVehicleHistory(
  data: CrmWorkspace,
  customerId: string
): VehicleHistoryEntry[] {
  const customerOrders = data.orders.filter((order) => order.customerId === customerId);
  return data.vehicles
    .filter((vehicle) => vehicle.customerId === customerId)
    .map((vehicle) => {
      const orders = vehicleOrders(customerOrders, vehicle.id);
      return {
        vehicle,
        orders,
        activeCount: orders.filter((order) => !isCompletedStatus(order.status)).length,
        totalCents: orders.reduce((sum, order) => sum + order.totalCents, 0)
      };
    })
    .toSorted(
      (a, b) =>
        Number(b.activeCount > 0) - Number(a.activeCount > 0) ||
        (b.orders[0]?.createdAt ?? '').localeCompare(a.orders[0]?.createdAt ?? '') ||
        a.vehicle.make.localeCompare(b.vehicle.make) ||
        a.vehicle.id.localeCompare(b.vehicle.id)
    );
}
