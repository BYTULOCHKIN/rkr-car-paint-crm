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
  WORKFLOW_COLUMNS
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
  const records = boardRecords(data);
  const active = records.filter((target) => target.record.status !== 'delivered');
  const activeRequests = active.filter((target) => target.kind === 'request');
  const inProgress = data.orders.filter((order) => order.status === 'in_progress');
  const ready = data.orders.filter((order) => order.status === 'ready');
  const deliveredThisMonth = data.orders.filter(
    (order) =>
      order.status === 'delivered' &&
      order.actualDeliveryDate?.startsWith(today.slice(0, 7)) &&
      order.actualDeliveryDate <= today
  );
  const overdue = active.filter((target) => overdueLabel(target, today));
  const attention = active
    .filter((target) => overdueLabel(target, today) || target.record.status === 'ready')
    .toSorted((a, b) => {
      const priority =
        Number(Boolean(overdueLabel(b, today))) - Number(Boolean(overdueLabel(a, today)));
      const dateA =
        a.kind === 'request' ? a.record.plannedIntakeDate : a.record.plannedDeliveryDate;
      const dateB =
        b.kind === 'request' ? b.record.plannedIntakeDate : b.record.plannedDeliveryDate;
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
      target.kind === 'request'
        ? target.record.plannedIntakeDate
        : target.record.plannedDeliveryDate;
    if (date && date >= today && date <= lastDay)
      schedule.push({ target, date, kind: target.kind === 'request' ? 'intake' : 'delivery' });
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

  return {
    activeRequests: activeRequests.length,
    backlog: activeRequests.filter((target) => target.record.status === 'backlog').length,
    scheduled: activeRequests.filter((target) => target.record.status === 'scheduled').length,
    inProgress: inProgress.length,
    ready: ready.length,
    activeValueCents: data.orders
      .filter((order) => order.status !== 'delivered')
      .reduce((sum, order) => sum + order.totalCents, 0),
    deliveredThisMonth: deliveredThisMonth.length,
    deliveredValueCents: deliveredThisMonth.reduce((sum, order) => sum + order.totalCents, 0),
    undatedDelivered: data.orders.filter(
      (order) => order.status === 'delivered' && !order.actualDeliveryDate
    ).length,
    overdue: overdue.length,
    attention,
    schedule: sortedSchedule,
    activity,
    statuses: WORKFLOW_COLUMNS.filter((column) => column.value !== 'delivered').map((column) => ({
      ...column,
      count: active.filter((target) => target.record.status === column.value).length
    })),
    recentOrders: data.orders
      .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt) || b.number - a.number)
      .slice(0, 5)
  };
}
