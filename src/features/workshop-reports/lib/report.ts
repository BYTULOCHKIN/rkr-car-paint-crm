import type { CrmWorkspace, CrmAccess } from '@/features/crm/api/types';
import type { StockMovement } from '@/features/inventory/api/types';
import type { EconomicsPosting, SettlementEvent } from '@/features/order-economics/api/types';
import { sumIntegers } from '@/features/order-economics/lib/integers';
import { payeeKey } from '@/features/order-economics/lib/settlements';
import { paymentDelta } from '@/features/crm/lib/payment-balance';
import type {
  PeriodReport,
  ReportFilters,
  ReportOrder,
  EconomicsTotals,
  OrderSettlementRow,
  PayeeReportRow,
  SettlementTotals,
  MaterialReportRow
} from '../api/types';
import { reportFiltersSchema } from '../schemas/filters';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
export function reportDate(timestamp: string): string | null {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = dateFormatter.formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function zeroEconomics(): EconomicsTotals {
  return {
    checkCents: 0,
    materialsCents: 0,
    employeeAccrualsCents: 0,
    subcontractCostsCents: 0,
    workshopRemainderCents: 0
  };
}
function economicsDelta(after: EconomicsTotals, before = zeroEconomics()): EconomicsTotals {
  return {
    checkCents: sumIntegers([after.checkCents, -before.checkCents]),
    materialsCents: sumIntegers([after.materialsCents, -before.materialsCents]),
    employeeAccrualsCents: sumIntegers([
      after.employeeAccrualsCents,
      -before.employeeAccrualsCents
    ]),
    subcontractCostsCents: sumIntegers([
      after.subcontractCostsCents,
      -before.subcontractCostsCents
    ]),
    workshopRemainderCents: sumIntegers([
      after.workshopRemainderCents,
      -before.workshopRemainderCents
    ])
  };
}
function zeroSettlement(): SettlementTotals {
  return {
    openingCents: 0,
    accrualCents: 0,
    adjustmentCents: 0,
    payoutCents: 0,
    returnCents: 0,
    reversalCents: 0,
    closingCents: 0,
    payableCents: 0,
    advanceCents: 0
  };
}
const settlementKeys = Object.keys(zeroSettlement()) as (keyof SettlementTotals)[];

/** Cash cancellations apply on their recording date, never retroactively to the original month. */
function balanceDelta(event: SettlementEvent, byId: Map<string, SettlementEvent>): number {
  if (event.kind === 'payout') return -event.amountCents;
  if (event.kind !== 'reversal') return event.amountCents;
  const original = event.reversalOf && byId.get(event.reversalOf);
  if (!original || (original.kind !== 'payout' && original.kind !== 'return'))
    throw new Error('Не знайдено початкову операцію скасування виплати');
  return original.kind === 'payout' ? event.amountCents : -event.amountCents;
}

/** Pure report projection. No writes, current exchange rates or invented legacy costs. */
export function buildPeriodReport(
  workspace: CrmWorkspace,
  movements: readonly StockMovement[],
  access: CrmAccess,
  filters: ReportFilters,
  generatedAt = new Date().toISOString()
): PeriodReport {
  const value = reportFiltersSchema.parse(filters);
  let undatedRecords = 0;
  const dated = (timestamp: string) => {
    const date = reportDate(timestamp);
    if (!date) undatedRecords++;
    return date;
  };
  const inPeriod = (date: string | null) => !!date && date >= value.from && date <= value.to;
  const vehicles = new Map(workspace.vehicles.map((entry) => [entry.id, entry]));
  const customers = new Map(workspace.customers.map((entry) => [entry.id, entry.name]));
  const orderRefs = new Map<string, ReportOrder>(
    workspace.orders.map((order) => {
      const vehicle = vehicles.get(order.vehicleId);
      return [
        order.id,
        {
          id: order.id,
          number: order.number,
          vehicle: vehicle
            ? [vehicle.make, vehicle.model, vehicle.plate].filter(Boolean).join(' ')
            : 'Авто не визначено',
          customer: customers.get(order.customerId) ?? 'Клієнт не визначений'
        }
      ];
    })
  );
  const orderRef = (id: string): ReportOrder => {
    const found = orderRefs.get(id);
    if (!found) throw new Error('Не знайдено замовлення фінансового запису');
    return found;
  };
  const result: PeriodReport = {
    access,
    filters: value,
    generatedAt,
    economics: null,
    postings: [],
    orders: [],
    cash: null,
    materials: { orders: [], rows: [] },
    settlements: { payees: [], orders: [], events: [] },
    undatedRecords: 0
  };
  const events = (workspace.finance?.events ?? []).filter(
    (event) =>
      access.role === 'admin' || (event.payee.kind === 'worker' && event.payee.id === access.userId)
  );
  const byId = new Map(
    [...events, ...(workspace.reportReversalSources ?? [])].map((event) => [event.id, event])
  );
  const settlementRows = new Map<string, OrderSettlementRow>();
  for (const opening of workspace.reportOpening ?? []) {
    if (
      access.role !== 'admin' &&
      !(opening.payee.kind === 'worker' && opening.payee.id === access.userId)
    )
      continue;
    settlementRows.set(JSON.stringify([opening.orderId, payeeKey(opening.payee)]), {
      ...zeroSettlement(),
      order: orderRef(opening.orderId),
      payee: opening.payee,
      openingCents: opening.amountCents,
      closingCents: opening.amountCents
    });
  }
  const activeRows = new Set<string>();
  for (const event of events) {
    const date = dated(event.createdAt);
    if (!date || date > value.to) continue;
    const key = JSON.stringify([event.orderId, payeeKey(event.payee)]);
    const row = settlementRows.get(key) ?? {
      ...zeroSettlement(),
      order: orderRef(event.orderId),
      payee: event.payee
    };
    row.payee = event.payee;
    const delta = balanceDelta(event, byId);
    if (date < value.from) row.openingCents = sumIntegers([row.openingCents, delta]);
    else {
      activeRows.add(key);
      const field = {
        accrual: 'accrualCents',
        adjustment: 'adjustmentCents',
        payout: 'payoutCents',
        return: 'returnCents',
        reversal: 'reversalCents'
      } as const;
      row[field[event.kind]] = sumIntegers([
        row[field[event.kind]],
        event.kind === 'reversal' ? delta : event.amountCents
      ]);
      result.settlements.events.push({
        id: event.id,
        order: row.order,
        payee: event.payee,
        kind: event.kind,
        amountCents: event.amountCents,
        balanceDeltaCents: delta,
        createdAt: event.createdAt,
        note: event.note,
        actor: event.actor
      });
    }
    row.closingCents = sumIntegers([row.closingCents, delta]);
    settlementRows.set(key, row);
  }
  const payeeRows = new Map<string, PayeeReportRow>();
  for (const [key, row] of settlementRows) {
    if (!row.openingCents && !row.closingCents && !activeRows.has(key)) continue;
    row.payableCents = Math.max(0, row.closingCents);
    row.advanceCents = Math.max(0, -row.closingCents);
    result.settlements.orders.push(row);
    const payee = payeeRows.get(payeeKey(row.payee)) ?? { ...zeroSettlement(), payee: row.payee };
    for (const field of settlementKeys) payee[field] = sumIntegers([payee[field], row[field]]);
    payeeRows.set(payeeKey(row.payee), payee);
  }
  result.settlements.payees = [...payeeRows.values()].toSorted((a, b) =>
    a.payee.name.localeCompare(b.payee.name, 'uk')
  );
  result.settlements.orders = result.settlements.orders.toSorted(
    (a, b) => a.order.number - b.order.number
  );
  result.settlements.events = result.settlements.events.toSorted((a, b) =>
    b.createdAt.localeCompare(a.createdAt)
  );
  // Workers get their own ledger only; administrative source rows never cross the service boundary.
  if (access.role === 'worker') return { ...result, undatedRecords };

  const latest = new Map<string, EconomicsPosting>();
  const previousVersions = new Map<string, EconomicsPosting>();
  const postings = (workspace.finance?.postings ?? []).toSorted(
    (a, b) => a.orderId.localeCompare(b.orderId) || a.revision - b.revision
  );
  const economics = zeroEconomics();
  for (const posting of postings) {
    const previous = previousVersions.get(posting.orderId);
    previousVersions.set(posting.orderId, posting);
    const date = dated(posting.createdAt);
    if (!date || date > value.to) continue;
    if (inPeriod(date)) {
      const delta = economicsDelta(posting.result, previous?.result);
      result.postings.push({
        id: posting.id,
        order: orderRef(posting.orderId),
        kind: posting.kind,
        revision: posting.revision,
        createdAt: posting.createdAt,
        delta,
        note: posting.note,
        actor: posting.actor
      });
      for (const key of Object.keys(economics) as (keyof EconomicsTotals)[])
        economics[key] = sumIntegers([economics[key], delta[key]]);
    }
    latest.set(posting.orderId, posting);
  }
  result.economics = economics;
  result.postings = result.postings.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const order of workspace.orders) {
    const date =
      value.orderDate === 'created'
        ? dated(order.createdAt)
        : value.orderDate === 'ready'
          ? order.actualReadyDate
          : order.actualDeliveryDate;
    if (!inPeriod(date)) continue;
    const posting = latest.get(order.id);
    result.orders.push({
      ...orderRef(order.id),
      date: date!,
      status: order.status,
      revision: posting?.revision ?? null,
      economics: posting ? { ...economicsDelta(posting.result) } : null
    });
  }
  result.orders = result.orders.toSorted((a, b) => a.number - b.number);
  const cashRows = (workspace.payments ?? []).flatMap((event) => {
    if (!inPeriod(dated(event.createdAt))) return [];
    return [
      {
        id: event.id,
        order: orderRef(event.orderId),
        kind: event.kind,
        amountCents: paymentDelta(event),
        createdAt: event.createdAt,
        note: event.note
      }
    ];
  });
  result.cash = {
    netCents: sumIntegers(cashRows.map((entry) => entry.amountCents)),
    rows: cashRows.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
  };

  const materialRows = new Map<string, MaterialReportRow>();
  const materialOrders = new Map<string, ReportOrder>();
  const periodMovements = movements.filter(
    (movement) =>
      movement.orderId &&
      (movement.kind === 'consumption' || movement.kind === 'reversal') &&
      inPeriod(dated(movement.createdAt))
  );
  // A matched unknown consumption and its exact reversal in the same period cancel completely.
  const periodIds = new Set(periodMovements.map((movement) => movement.id));
  const cancelledPairs = new Set(
    periodMovements.flatMap((movement) =>
      movement.reversesId && periodIds.has(movement.reversesId)
        ? [movement.id, movement.reversesId]
        : []
    )
  );
  for (const movement of periodMovements) {
    const id = movement.orderId!;
    materialOrders.set(id, orderRef(id));
    const row = materialRows.get(movement.itemId) ?? {
      id: movement.itemId,
      name: movement.itemName,
      ...(movement.accountingMode === 'amount' ? { accountingMode: 'amount' as const } : {}),
      unit: movement.unit,
      quantityMilli: 0,
      costCents: 0,
      unknownMovements: 0,
      cells: {}
    };
    const cell = row.cells[id] ?? { quantityMilli: 0, costCents: 0, unknownMovements: 0 };
    const unknown = movement.costDeltaCents === null && !cancelledPairs.has(movement.id);
    const cost = unknown ? null : -(movement.costDeltaCents ?? 0);
    for (const target of [row, cell]) {
      target.quantityMilli = sumIntegers([target.quantityMilli, -movement.deltaMilli]);
      target.unknownMovements += Number(unknown);
      target.costCents =
        target.costCents === null || cost === null ? null : sumIntegers([target.costCents, cost]);
    }
    row.cells[id] = cell;
    materialRows.set(movement.itemId, row);
  }
  result.materials = {
    orders: [...materialOrders.values()].toSorted((a, b) => a.number - b.number),
    rows: [...materialRows.values()].toSorted((a, b) => a.name.localeCompare(b.name, 'uk'))
  };
  return { ...result, undatedRecords };
}
