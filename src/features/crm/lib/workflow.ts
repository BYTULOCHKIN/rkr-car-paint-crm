import type { BoardStatus, CrmWorkspace, WorkflowRecord } from '../api/types';

export const WORKFLOW_COLUMNS: { value: BoardStatus; label: string }[] = [
  { value: 'backlog', label: 'Backlog' },
  { value: 'scheduled', label: 'Заплановано' },
  { value: 'in_progress', label: 'У роботі' },
  { value: 'ready', label: 'Готово' },
  { value: 'delivered', label: 'Видано' }
];

export function statusLabel(status: string): string {
  return status === 'converted'
    ? 'У замовленні'
    : (WORKFLOW_COLUMNS.find((column) => column.value === status)?.label ?? status);
}

// Calendar dates, not UTC timestamps. The workshop operates in Kyiv time.
export function businessToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function displayDate(value: string | null | undefined): string {
  if (!value) return 'Не визначено';
  return new Intl.DateTimeFormat('uk-UA').format(new Date(`${value}T12:00:00`));
}

export function boardRecords(data: CrmWorkspace): WorkflowRecord[] {
  return [
    ...data.requests
      .filter(
        (request) =>
          request.status !== 'converted' &&
          !data.orders.some((order) => order.requestId === request.id)
      )
      .map((record): WorkflowRecord => ({ kind: 'request', record })),
    ...data.orders.map((record): WorkflowRecord => ({ kind: 'order', record }))
  ];
}

export function overdueLabel(item: WorkflowRecord, today = businessToday()): string | null {
  const { record } = item;
  if (item.kind === 'request')
    return record.status !== 'converted' &&
      record.plannedIntakeDate &&
      record.plannedIntakeDate < today
      ? 'Прострочено прийом'
      : null;
  if (item.record.status === 'delivered') return null;
  return record.plannedDeliveryDate && record.plannedDeliveryDate < today
    ? 'Прострочено видачу'
    : null;
}

export function transitionKind(
  target: WorkflowRecord,
  status: BoardStatus
): 'none' | 'convert' | 'workflow' | 'invalid' {
  if (target.record.status === status) return 'none';
  if (target.kind === 'request' && target.record.status === 'converted') return 'invalid';
  if (target.kind === 'request' && status === 'in_progress') return 'convert';
  const allowed =
    target.kind === 'request' ? ['backlog', 'scheduled'] : ['in_progress', 'ready', 'delivered'];
  return allowed.includes(status) ? 'workflow' : 'invalid';
}
