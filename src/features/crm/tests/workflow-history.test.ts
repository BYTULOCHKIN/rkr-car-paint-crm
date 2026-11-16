import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkflowEvent, WorkflowRecord } from '../api/types';
import {
  historyDateChanges,
  historyEventTitle,
  historyTimestamp,
  workflowHistory
} from '../lib/workflow-history';

const event = (overrides: Partial<WorkflowEvent> = {}): WorkflowEvent => ({
  id: 'event',
  kind: 'order',
  recordId: 'order',
  fromStatus: 'in_progress',
  toStatus: 'in_progress',
  previousIntakeDate: null,
  previousDeliveryDate: null,
  plannedIntakeDate: null,
  plannedDeliveryDate: null,
  note: '',
  createdAt: '2026-11-16T10:00:00Z',
  actualDateChanges: [],
  ...overrides
});
const target: WorkflowRecord = {
  kind: 'order',
  record: {
    id: 'order',
    requestId: 'request',
    number: 1,
    customerId: 'customer',
    vehicleId: 'vehicle',
    description: '',
    createdAt: '',
    items: [],
    totalCents: 0,
    status: 'in_progress',
    plannedIntakeDate: null,
    plannedDeliveryDate: null,
    actualIntakeDate: null,
    actualReadyDate: null,
    actualDeliveryDate: null
  }
};

test('history includes linked request events, sorts newest first, preserves tie order and never mutates input', () => {
  const events = [
    event({ id: 'older', createdAt: '2026-11-15T10:00:00Z' }),
    event({ id: 'newer' }),
    event({ id: 'linked', kind: 'request', recordId: 'request' }),
    event({ id: 'other', recordId: 'other-order' }),
    event({ id: 'unrelated-request', kind: 'request', recordId: 'other-request' })
  ];
  const original = events.slice();
  assert.deepEqual(
    workflowHistory(target, events).map((event) => event.id),
    ['newer', 'linked', 'older']
  );
  assert.deepEqual(events, original);
});

test('date changes retain removal, initial values, corrections and keep legacy note text separate', () => {
  const changes = historyDateChanges(
    event({
      previousIntakeDate: '2020-01-01',
      plannedDeliveryDate: '2020-01-10',
      actualDateChanges: [{ field: 'actualReadyDate', before: '2020-01-08', after: '2020-01-09' }]
    })
  );
  assert.deepEqual(changes, [
    { label: 'Прийом · план', before: '2020-01-01', after: null },
    { label: 'Видача · план', before: null, after: '2020-01-10' },
    { label: 'Готовність · факт', before: '2020-01-08', after: '2020-01-09' }
  ]);
  assert.deepEqual(
    historyDateChanges(event({ actualDateChanges: null, note: 'Фактична видача: 2020-01-15 → —' })),
    []
  );
});

test('titles distinguish creation, conversion, status edits, factual corrections and note-only events', () => {
  assert.equal(historyEventTitle(event({ fromStatus: null })), 'Замовлення створено');
  assert.equal(historyEventTitle(event({ fromStatus: null, kind: 'request' })), 'Заявку створено');
  assert.equal(
    historyEventTitle(event({ kind: 'request', toStatus: 'converted' })),
    'Заявку взято в роботу'
  );
  assert.equal(historyEventTitle(event({ toStatus: 'ready' })), 'Статус змінено');
  assert.equal(
    historyEventTitle(
      event({
        actualDateChanges: [{ field: 'actualReadyDate', before: null, after: '2020-01-08' }]
      })
    ),
    'Дати оновлено'
  );
  assert.equal(historyEventTitle(event({ note: 'Домовилися з клієнтом' })), 'Додано примітку');
  assert.equal(historyEventTitle(event({ actualDateChanges: null })), 'Дані оновлено');
});

test('event time follows Kyiv DST, includes seconds and handles missing legacy timestamps', () => {
  assert.equal(historyTimestamp('2026-03-29T00:30:01Z'), '29.03.2026 · 02:30:01');
  assert.equal(historyTimestamp('2026-03-29T01:30:02Z'), '29.03.2026 · 04:30:02');
  assert.equal(historyTimestamp('not-a-date'), 'Час не збережено');
});
