import test from 'node:test';
import assert from 'node:assert/strict';
import type { RepairOrder } from '../api/types';
import { executorTransition } from '../lib/executor-workflow';
const order: RepairOrder = {
  id: '00000000-0000-4000-8000-000000000001',
  number: 1,
  requestId: null,
  customerId: 'c',
  vehicleId: 'v',
  description: 'Фарбування',
  createdAt: '',
  status: 'in_progress',
  plannedIntakeDate: '2020-01-01',
  plannedDeliveryDate: '2020-01-10',
  actualIntakeDate: '2020-01-02',
  actualReadyDate: null,
  actualDeliveryDate: null,
  items: [],
  totalCents: 0,
  workflowRevision: 1
};
test('executor can take only the next step and preserves all previous facts and plans', () => {
  const input = { id: order.id, expectedStatus: order.status, expectedRevision: 1 };
  const ready = executorTransition(order, input, '2020-01-05');
  assert.equal(ready.ok, true);
  if (!ready.ok) return;
  assert.equal(ready.data.status, 'ready');
  assert.equal(ready.data.actualReadyDate, '2020-01-05');
  assert.equal(ready.data.actualIntakeDate, order.actualIntakeDate);
  assert.equal(ready.data.plannedDeliveryDate, order.plannedDeliveryDate);
  const current = {
    ...order,
    status: 'ready' as const,
    actualReadyDate: '2020-01-05',
    workflowRevision: 2
  };
  const delivered = executorTransition(
    current,
    { ...input, expectedStatus: 'ready', expectedRevision: 2 },
    '2020-01-06'
  );
  assert.equal(delivered.ok, false);
  assert.equal(
    executorTransition(
      { ...current, status: 'delivered', actualDeliveryDate: '2020-01-06' },
      { ...input, expectedStatus: 'delivered', expectedRevision: 2 }
    ).ok,
    false
  );
});
test('legacy missing facts, stale forms and impossible chronology cannot be advanced', () => {
  const input = { id: order.id, expectedStatus: order.status, expectedRevision: 1 };
  assert.equal(executorTransition({ ...order, actualIntakeDate: null }, input).ok, false);
  assert.equal(
    executorTransition({ ...order, status: 'ready' }, { ...input, expectedStatus: 'ready' }).ok,
    false
  );
  assert.equal(executorTransition(order, { ...input, expectedRevision: 0 }).ok, false);
  assert.equal(executorTransition(order, { ...input, expectedStatus: 'ready' }).ok, false);
  assert.equal(executorTransition(order, input, '2019-01-01').ok, false);
});
