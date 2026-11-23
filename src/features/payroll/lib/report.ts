import type { CrmAccess, CrmWorkspace, TeamMember } from '@/features/crm/api/types';
import type { EconomicsPosting } from '@/features/order-economics/api/types';
import { sumIntegers } from '@/features/order-economics/lib/integers';
import { reportDate } from '@/features/workshop-reports/lib/report';
import { payrollFiltersSchema } from '../schemas/filters';
import type {
  PayrollCalculation,
  PayrollEntry,
  PayrollFilters,
  PayrollOrder,
  PayrollReport,
  PayrollRole,
  PayrollTotals,
  PayrollWorker
} from '../api/types';

interface Contribution extends PayrollCalculation {
  workerId: string;
  name: string;
  role: PayrollRole;
}

function contributions(posting: EconomicsPosting | undefined): Map<string, Contribution> {
  const result = new Map<string, Contribution>();
  if (!posting) return result;
  for (const role of ['painter', 'polisher', 'assembler'] as const) {
    const workerId = posting.details[`${role}Id`];
    if (!workerId) continue;
    result.set(`${workerId}:${role}`, {
      workerId,
      name: posting.details[`${role}Name`] || 'Працівник',
      role: posting.model === 'order_net' ? 'responsible' : role,
      baseCents: posting.result[`${role}BaseCents`],
      shareBps: posting.details.employeeShareBps,
      amountCents: posting.result[`${role}AccrualCents`]
    });
  }
  return result;
}

function calculation(value: Contribution | undefined): PayrollCalculation | null {
  return value
    ? { baseCents: value.baseCents, shareBps: value.shareBps, amountCents: value.amountCents }
    : null;
}

function coloristCost(posting: EconomicsPosting | undefined): number {
  if (posting?.model === 'order_net')
    return sumIntegers(
      (posting.expenses ?? [])
        .filter((expense) => expense.kind === 'color_matching')
        .map((expense) => expense.amountCents)
    );
  return sumIntegers(
    (posting?.details.lines ?? [])
      .filter((line) => line.kind === 'color_matching')
      .map((line) => line.subcontractCostCents)
  );
}

export function payrollTotals(entries: readonly PayrollEntry[]): PayrollTotals {
  const accrualCents = sumIntegers(
    entries.filter((entry) => entry.kind === 'initial').map((entry) => entry.amountCents)
  );
  const adjustmentCents = sumIntegers(
    entries.filter((entry) => entry.kind === 'correction').map((entry) => entry.amountCents)
  );
  return {
    accrualCents,
    adjustmentCents,
    totalCents: sumIntegers([accrualCents, adjustmentCents]),
    orderCount: new Set(entries.map((entry) => entry.order.id)).size
  };
}

/** Read stored posting versions; never recalculate earnings using today's rates or cash movements. */
export function buildPayrollReport(
  workspace: CrmWorkspace,
  team: readonly TeamMember[],
  access: CrmAccess,
  filters: PayrollFilters,
  generatedAt = new Date().toISOString()
): PayrollReport {
  const value = payrollFiltersSchema.parse(filters);
  const admin = access.role === 'admin';
  const visible = (id: string) => admin || id === access.userId;
  const vehicles = new Map(workspace.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const orders = new Map<string, PayrollOrder>(
    workspace.orders.map((order) => {
      const vehicle = vehicles.get(order.vehicleId);
      return [
        order.id,
        {
          id: order.id,
          number: order.number,
          vehicle: vehicle
            ? [vehicle.make, vehicle.model, vehicle.plate].filter(Boolean).join(' ')
            : 'Авто не визначено'
        }
      ];
    })
  );
  const workers = new Map<string, PayrollWorker>();
  function worker(id: string, historicalName: string): PayrollWorker {
    let row = workers.get(id);
    if (!row) {
      const member = team.find((member) => member.id === id);
      row = {
        id,
        name: member?.name ?? historicalName,
        ...(member?.imageUrl ? { imageUrl: member.imageUrl } : {}),
        active: !!member,
        specialties: member?.specialties ?? [],
        entries: [],
        accrualCents: 0,
        adjustmentCents: 0,
        totalCents: 0,
        orderCount: 0
      };
      workers.set(id, row);
    }
    return row;
  }
  for (const member of team) if (visible(member.id)) worker(member.id, member.name);
  const warnings: PayrollReport['warnings'] = {
    undatedPostings: 0,
    unpostedOrders: [],
    coloristSubcontractCents: 0
  };
  const previous = new Map<string, EconomicsPosting>();
  const postedByEnd = new Set<string>();
  for (const posting of (workspace.finance?.postings ?? []).toSorted(
    (a, b) => a.orderId.localeCompare(b.orderId) || a.revision - b.revision
  )) {
    const prior = previous.get(posting.orderId);
    previous.set(posting.orderId, posting);
    const before = contributions(prior);
    const after = contributions(posting);
    const keys = [...new Set([...before.keys(), ...after.keys()])];
    const date = reportDate(posting.createdAt);
    if (!date) {
      if (admin || keys.some((key) => visible((after.get(key) ?? before.get(key))!.workerId)))
        warnings.undatedPostings++;
      continue;
    }
    if (date <= value.to) postedByEnd.add(posting.orderId);
    if (date < value.from || date > value.to) continue;
    const order = orders.get(posting.orderId);
    if (!order) throw new Error('Не знайдено замовлення нарахування зарплати');
    if (admin)
      warnings.coloristSubcontractCents = sumIntegers([
        warnings.coloristSubcontractCents,
        coloristCost(posting),
        -coloristCost(prior)
      ]);
    for (const key of keys) {
      const old = before.get(key);
      const current = after.get(key);
      const person = (current ?? old)!;
      if (!visible(person.workerId)) continue;
      const amountCents = sumIntegers([current?.amountCents ?? 0, -(old?.amountCents ?? 0)]);
      if (!amountCents && !(posting.model === 'order_net' && posting.kind === 'initial' && current))
        continue;
      worker(person.workerId, person.name).entries.push({
        id: `${posting.id}:${key}`,
        workerId: person.workerId,
        order,
        role: person.role,
        kind: posting.kind,
        createdAt: posting.createdAt,
        before: calculation(old),
        after: calculation(current),
        amountCents,
        note: posting.note
      });
    }
  }
  if (admin)
    for (const order of workspace.orders) {
      if (
        order.status === 'ready' &&
        order.actualReadyDate &&
        order.actualReadyDate >= value.from &&
        order.actualReadyDate <= value.to &&
        !postedByEnd.has(order.id)
      )
        warnings.unpostedOrders.push(orders.get(order.id)!);
    }
  const rows = [...workers.values()].toSorted((a, b) => a.name.localeCompare(b.name, 'uk'));
  for (const row of rows) {
    row.entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    Object.assign(row, payrollTotals(row.entries));
  }
  return {
    access,
    filters: value,
    generatedAt,
    totals: payrollTotals(rows.flatMap((row) => row.entries)),
    workers: rows,
    warnings
  };
}
