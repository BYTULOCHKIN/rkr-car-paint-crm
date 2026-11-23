import { paymentBalance, paymentDelta } from '@/features/crm/lib/payment-balance';
import type {
  BoardStatus,
  CrmWorkspace,
  RepairOrder,
  WorkflowRecord
} from '@/features/crm/api/types';
import {
  boardRecords,
  businessToday,
  overdueLabel,
  WORKFLOW_COLUMNS,
  isCompletedStatus,
  boardStatus
} from '@/features/crm/lib/workflow';

export interface ActivityMonth {
  month: string;
  label: string;
  requests: number;
  orders: number;
}

export interface ScheduleEntry {
  target: WorkflowRecord;
  date: string;
  kind: 'intake' | 'delivery';
}

export interface OverviewMetrics {
  monthlyReceiptsCents: number;
  debtCents: number;
  debtOrderCount: number;
  pendingPaymentCents: number;
  createdOrders: number;
  activeRequests: number;
  backlog: number;
  scheduled: number;
  inProgress: number;
  ready: number;
  activeValueCents: number;
  deliveredThisMonth: number;
  deliveredValueCents: number;
  undatedDelivered: number;
  overdue: number;
  attention: WorkflowRecord[];
  schedule: ScheduleEntry[];
  activity: ActivityMonth[];
  statuses: { value: BoardStatus; label: string; count: number }[];
  recentOrders: RepairOrder[];
}

/** UTC is a calendar arithmetic container; timestamp grouping uses Kyiv business dates. */
function addDays(date: string, days: number): string {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function overviewMetrics(data: CrmWorkspace, today = businessToday()): OverviewMetrics {
  const records = boardRecords(data).filter((target) => target.kind === 'order');
  const active = records.filter((target) => !isCompletedStatus(target.record.status));
  const activeRequests = boardRecords(data).filter((target) => target.kind === 'request');
  const inProgress = data.orders.filter((order) => order.status === 'in_progress');
  const ready = data.orders.filter((order) => isCompletedStatus(order.status));
  const deliveredThisMonth = data.orders.filter(
    (order) =>
      isCompletedStatus(order.status) &&
      (order.actualReadyDate ?? order.actualDeliveryDate)?.startsWith(today.slice(0, 7)) &&
      (order.actualReadyDate ?? order.actualDeliveryDate)! <= today
  );
  const overdue = active.filter((target) => overdueLabel(target, today));
  const attention = records
    .filter((target) => overdueLabel(target, today))
    .toSorted((a, b) => {
      const priority =
        Number(Boolean(overdueLabel(b, today))) - Number(Boolean(overdueLabel(a, today)));
      const dateA = a.record.plannedDeliveryDate;
      const dateB = b.record.plannedDeliveryDate;
      return (
        priority ||
        (dateA ?? '9999').localeCompare(dateB ?? '9999') ||
        a.record.createdAt.localeCompare(b.record.createdAt) ||
        a.record.id.localeCompare(b.record.id)
      );
    });
  const schedule: ScheduleEntry[] = [];
  const lastDay = addDays(today, 6);
  for (const target of active) {
    const date =
      target.record.status === 'created' && target.record.plannedIntakeDate
        ? target.record.plannedIntakeDate
        : target.record.plannedDeliveryDate;
    if (date && date >= today && date <= lastDay)
      schedule.push({
        target,
        date,
        kind:
          target.record.status === 'created' && target.record.plannedIntakeDate
            ? 'intake'
            : 'delivery'
      });
  }
  const sortedSchedule = schedule.toSorted(
    (a, b) => a.date.localeCompare(b.date) || a.target.record.id.localeCompare(b.target.record.id)
  );

  const monthDate = new Date(`${today.slice(0, 7)}-01T12:00:00Z`);
  const activity: ActivityMonth[] = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(monthDate);
    date.setUTCMonth(date.getUTCMonth() - 5 + index);
    return {
      month: date.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat('uk-UA', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC'
      }).format(date),
      requests: 0,
      orders: 0
    };
  });
  const months = new Map(activity.map((month) => [month.month, month]));
  // Converted requests stay in creation history, but are excluded from current workload.
  for (const request of data.requests) {
    const created = businessToday(new Date(request.createdAt));
    if (created > today) continue;
    const month = months.get(created.slice(0, 7));
    if (month) month.requests++;
  }
  for (const order of data.orders) {
    const created = businessToday(new Date(order.createdAt));
    if (created > today) continue;
    const month = months.get(created.slice(0, 7));
    if (month) month.orders++;
  }

  const payments = data.payments ?? [];
  const cancelled = new Set(
    payments
      .filter((entry) => entry.kind === 'reversal' || entry.kind === 'refund_reversal')
      .map((entry) => entry.reversalOf)
  );
  const monthlyReceiptsCents = payments
    .filter(
      (entry) =>
        (entry.kind === 'payment' || entry.kind === 'refund') &&
        !cancelled.has(entry.id) &&
        businessToday(new Date(entry.createdAt)).startsWith(today.slice(0, 7)) &&
        businessToday(new Date(entry.createdAt)) <= today
    )
    .reduce((sum, entry) => sum + paymentDelta(entry), 0);
  const balances = data.orders.map((order) => ({ order, ...paymentBalance(order, payments) }));
  const debts = balances.filter(
    (entry) => isCompletedStatus(entry.order.status) && entry.remainingCents > 0
  );
  return {
    monthlyReceiptsCents,
    debtCents: debts.reduce((sum, entry) => sum + entry.remainingCents, 0),
    debtOrderCount: debts.length,
    pendingPaymentCents: balances
      .filter((entry) => !isCompletedStatus(entry.order.status))
      .reduce((sum, entry) => sum + entry.remainingCents, 0),
    createdOrders: data.orders.filter((order) => order.status === 'created').length,
    activeRequests: activeRequests.length,
    backlog: activeRequests.filter((target) => target.record.status === 'backlog').length,
    scheduled: activeRequests.filter((target) => target.record.status === 'scheduled').length,
    inProgress: inProgress.length,
    ready: ready.length,
    activeValueCents: data.orders
      .filter((order) => !isCompletedStatus(order.status))
      .reduce((sum, order) => sum + order.totalCents, 0),
    deliveredThisMonth: deliveredThisMonth.length,
    deliveredValueCents: deliveredThisMonth.reduce((sum, order) => sum + order.totalCents, 0),
    undatedDelivered: data.orders.filter(
      (order) =>
        isCompletedStatus(order.status) && !order.actualReadyDate && !order.actualDeliveryDate
    ).length,
    overdue: overdue.length,
    attention,
    schedule: sortedSchedule,
    activity,
    statuses: WORKFLOW_COLUMNS.map((column) => ({
      ...column,
      count: records.filter((target) => boardStatus(target.record.status) === column.value).length
    })),
    recentOrders: data.orders
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt) || b.number - a.number)
      .slice(0, 5)
  };
}
