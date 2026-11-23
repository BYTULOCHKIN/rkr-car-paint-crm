import { money } from './format';
import { partLabel, paintModeLabel } from '../constants/paint-plan';
import { workKindOptions } from '@/features/order-economics/lib/details';
import type { CrmWorkspace, WorkflowEvent, WorkflowRecord, OrderItem } from '../api/types';

export interface HistoryDateChange {
  label: string;
  before: string | null;
  after: string | null;
}

export function historyDateChanges(event: WorkflowEvent): HistoryDateChange[] {
  const changes: HistoryDateChange[] = [];
  if (event.previousIntakeDate !== event.plannedIntakeDate)
    changes.push({
      label: 'Прийом · план',
      before: event.previousIntakeDate,
      after: event.plannedIntakeDate
    });
  if (event.previousDeliveryDate !== event.plannedDeliveryDate)
    changes.push({
      label: 'Видача · план',
      before: event.previousDeliveryDate,
      after: event.plannedDeliveryDate
    });
  const labels = {
    actualIntakeDate: 'Прийом · факт',
    actualReadyDate: 'Готовність · факт',
    actualDeliveryDate: 'Видача · факт'
  };
  for (const change of event.actualDateChanges ?? []) {
    if (change.before !== change.after)
      changes.push({ label: labels[change.field], before: change.before, after: change.after });
  }
  return changes;
}

export function historyEventTitle(event: WorkflowEvent): string {
  if (event.orderChanges) return 'Замовлення змінено';
  if (!event.fromStatus)
    return event.kind === 'request' ? 'Заявку створено' : 'Замовлення створено';
  if (event.toStatus === 'converted') return 'Заявку взято в роботу';
  const datesChanged = historyDateChanges(event).length > 0;
  if (event.fromStatus !== event.toStatus)
    return datesChanged ? 'Статус і дати змінено' : 'Статус змінено';
  if (datesChanged) return 'Дати оновлено';
  return event.actualDateChanges == null ? 'Дані оновлено' : 'Додано примітку';
}

export function workflowHistory(
  target: WorkflowRecord,
  events: CrmWorkspace['events']
): WorkflowEvent[] {
  const relatedRequest = target.kind === 'order' ? target.record.requestId : null;
  return events
    .filter(
      (event) =>
        (event.kind === target.kind && event.recordId === target.record.id) ||
        (relatedRequest !== null && event.kind === 'request' && event.recordId === relatedRequest)
    )
    .toSorted((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}

/** Fixed Kyiv timezone and explicit parts keep SSR and browser text consistent. */
export function historyTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Час не збережено';
  const parts = new Intl.DateTimeFormat('uk-UA', {
    timeZone: 'Europe/Kyiv',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const part = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${part('day')}.${part('month')}.${part('year')} · ${part('hour')}:${part('minute')}:${part('second')}`;
}

export interface HistoryContentChange {
  label: string;
  before: string;
  after: string;
}

function lines(items: OrderItem[]): string {
  return items
    .map(
      (item, index) =>
        `${index + 1}. ${item.description}\nКількість: ${item.quantity} · Ціна: ${money(item.unitPriceCents)}`
    )
    .join('\n\n');
}

export function historyOrderChanges(event: WorkflowEvent): HistoryContentChange[] {
  if (!event.orderChanges) return [];
  const { before, after } = event.orderChanges;
  const changes: HistoryContentChange[] = [];
  if (JSON.stringify(before.economics) !== JSON.stringify(after.economics)) {
    const summary = (details: typeof before.economics): string =>
      details
        ? [
            `Ставка: ${details.employeeShareBps / 100}%`,
            `Маляр: ${details.painterName || 'Не призначено'}`,
            `Полірувальник: ${details.polisherName || 'Не призначено'}`,
            `Розбірник: ${details.assemblerName || 'Не призначено'}`,
            ...details.lines.map(
              (line) =>
                `${workKindOptions.find((option) => option.value === line.kind)?.label}: ${line.description}; полірування ${money(line.polishingCents)}, субпідряд ${money(line.subcontractCostCents)}${line.contractorName ? ` · ${line.contractorName}` : ''}`
            )
          ].join('\n')
        : 'Не деталізовано';
    changes.push({
      label: 'Внутрішня економіка',
      before: summary(before.economics),
      after: summary(after.economics)
    });
  }
  if (before.employeeShareBps !== after.employeeShareBps)
    changes.push({
      label: 'Частка відповідального',
      before:
        before.employeeShareBps === undefined ? 'Не вказано' : `${before.employeeShareBps / 100}%`,
      after:
        after.employeeShareBps === undefined ? 'Не вказано' : `${after.employeeShareBps / 100}%`
    });
  if (before.assigneeId !== after.assigneeId)
    changes.push({
      label: 'Відповідальний',
      before: before.assigneeName || 'Не призначено',
      after: after.assigneeName || 'Не призначено'
    });
  if (before.description !== after.description)
    changes.push({
      label: 'Опис замовлення',
      before: before.description,
      after: after.description
    });
  if (before.items.length === after.items.length) {
    before.items.forEach((item, index) => {
      const next = after.items[index];
      const prefix = `Позиція ${index + 1}`;
      if (item.description !== next.description)
        changes.push({
          label: `${prefix} · назва роботи`,
          before: item.description,
          after: next.description
        });
      if (item.quantity !== next.quantity)
        changes.push({
          label: `${prefix} · кількість`,
          before: String(item.quantity),
          after: String(next.quantity)
        });
      if (item.unitPriceCents !== next.unitPriceCents)
        changes.push({
          label: `${prefix} · ціна за одиницю`,
          before: money(item.unitPriceCents),
          after: money(next.unitPriceCents)
        });
    });
  } else {
    changes.push({ label: 'Склад робіт', before: lines(before.items), after: lines(after.items) });
  }
  if (before.totalCents !== after.totalCents)
    changes.push({
      label: 'Загальна сума',
      before: money(before.totalCents),
      after: money(after.totalCents)
    });
  for (const id of new Set([...before.paintPlan, ...after.paintPlan].map((part) => part.partId))) {
    const previous = before.paintPlan.find((part) => part.partId === id)?.mode;
    const next = after.paintPlan.find((part) => part.partId === id)?.mode;
    if (previous !== next)
      changes.push({
        label: `Кузов · ${partLabel(id)}`,
        before: previous ? paintModeLabel(previous) : 'Не позначено',
        after: next ? paintModeLabel(next) : 'Не позначено'
      });
  }
  return changes;
}
