import type { UniqueIdentifier } from '@dnd-kit/core';
import type { CrmWorkspace, Customer, Vehicle, WorkflowRecord } from '../api/types';
import { contactSearchValues } from './customer-contacts';
import { boardRecords, WORKFLOW_COLUMNS } from './workflow';

export const BOARD_BATCH_SIZE = 25;

export interface BoardCard {
  id: string;
  target: WorkflowRecord;
  customer?: Customer;
  vehicle?: Vehicle;
  searchText: string;
  plannedDate: string;
}
export type BoardColumns = Record<UniqueIdentifier, BoardCard[]>;

/** Build joins, normalized search text and stable date ordering once per workspace update. */
export function indexBoard(data: CrmWorkspace): BoardCard[] {
  const customers = new Map(data.customers.map((customer) => [customer.id, customer]));
  const vehicles = new Map(data.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const contacts = new Map(
    data.customers.map((customer) => [customer.id, contactSearchValues(customer)])
  );
  return boardRecords(data)
    .filter((target) => data.access?.role !== 'worker' || target.kind === 'order')
    .map((target) => {
      const customer = customers.get(target.record.customerId);
      const vehicle = vehicles.get(target.record.vehicleId);
      return {
        id: `${target.kind}:${target.record.id}`,
        target,
        customer,
        vehicle,
        searchText: [
          customer?.name,
          ...(contacts.get(target.record.customerId) ?? []),
          vehicle?.vin,
          vehicle?.plate,
          vehicle?.make,
          vehicle?.model,
          target.record.description,
          target.kind === 'order' ? target.record.number : ''
        ]
          .join(' ')
          .toLocaleLowerCase('uk-UA'),
        plannedDate:
          (target.kind === 'request'
            ? target.record.plannedIntakeDate
            : target.record.plannedDeliveryDate) || '9999'
      };
    })
    .toSorted(
      (a, b) =>
        a.plannedDate.localeCompare(b.plannedDate) ||
        a.target.record.createdAt.localeCompare(b.target.record.createdAt)
    );
}

export function filterBoard(cards: BoardCard[], search: string): BoardColumns {
  const columns: BoardColumns = Object.fromEntries(
    WORKFLOW_COLUMNS.map((column) => [column.value, []])
  );
  const query = search.trim().toLocaleLowerCase('uk-UA');
  for (const card of cards) {
    if (!query || card.searchText.includes(query)) columns[card.target.record.status]?.push(card);
  }
  return columns;
}

export function batchBoard(columns: BoardColumns, limit = BOARD_BATCH_SIZE): BoardColumns {
  return Object.fromEntries(
    Object.entries(columns).map(([status, cards]) => [status, cards.slice(0, limit)])
  );
}
