import assert from 'node:assert/strict';
import test from 'node:test';
import type { CrmWorkspace, RepairOrder, RepairRequest } from '../../crm/api/types';
import { overviewMetrics } from '../lib/metrics';

const empty = (): CrmWorkspace => ({
  customers: [],
  vehicles: [],
  requests: [],
  orders: [],
  events: []
});
const request = (id: string, values: Partial<RepairRequest> = {}): RepairRequest => ({
  id,
  customerId: 'customer',
  vehicleId: 'vehicle',
  description: 'Ремонт',
  status: 'backlog',
  createdAt: '2026-10-01T10:00:00Z',
  plannedIntakeDate: null,
  plannedDeliveryDate: null,
  ...values
});
const order = (id: string, values: Partial<RepairOrder> = {}): RepairOrder => ({
  id,
  number: 1,
  customerId: 'customer',
  vehicleId: 'vehicle',
  requestId: null,
  description: 'Ремонт',
  status: 'in_progress',
  createdAt: '2026-10-01T10:00:00Z',
  plannedIntakeDate: null,
  plannedDeliveryDate: null,
  actualIntakeDate: '2026-10-01',
  actualReadyDate: null,
  actualDeliveryDate: null,
  items: [],
  totalCents: 100001,
  ...values
});

test('an empty CRM produces zero metrics and six real calendar months', () => {
  const metrics = overviewMetrics(empty(), '2027-01-31');
  assert.equal(metrics.activeRequests, 0);
  assert.equal(metrics.deliveredValueCents, 0);
  assert.deepEqual(metrics.attention, []);
  assert.deepEqual(metrics.schedule, []);
  assert.deepEqual(
    metrics.activity.map((month) => month.month),
    ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01']
  );
  assert.ok(metrics.activity.every((month) => !month.requests && !month.orders));
});

test('conversion does not duplicate workload; ready and in-progress counts are separate', () => {
  const data = empty();
  data.requests = [
    request('converted', { status: 'converted' }),
    request('linked'),
    request('backlog'),
    request('scheduled', { status: 'scheduled' })
  ];
  data.orders = [
    order('one', { requestId: 'linked' }),
    order('two', { status: 'ready' }),
    order('three', { status: 'delivered', actualDeliveryDate: '2026-10-20' })
  ];
  const metrics = overviewMetrics(data, '2026-10-31');
  assert.equal(metrics.activeRequests, 2);
  assert.equal(metrics.backlog, 1);
  assert.equal(metrics.scheduled, 1);
  assert.equal(metrics.inProgress, 1);
  assert.equal(metrics.ready, 1);
  assert.equal(metrics.activeValueCents, 200002);
  assert.equal(
    metrics.statuses.reduce((sum, status) => sum + status.count, 0),
    4
  );
  assert.equal(metrics.activity.at(-1)?.requests, 4);
});

test('monthly completed value uses actual delivery dates and integer kopecks', () => {
  const data = empty();
  data.orders = [
    order('this-month', {
      createdAt: '2026-07-01T10:00:00Z',
      status: 'delivered',
      actualDeliveryDate: '2026-10-01',
      totalCents: 12345
    }),
    order('old', { status: 'delivered', actualDeliveryDate: '2026-09-30' }),
    order('unknown', { status: 'delivered' }),
    order('future', { status: 'delivered', actualDeliveryDate: '2026-11-01' }),
    order('ready', { status: 'ready', plannedDeliveryDate: '2026-10-30' })
  ];
  const metrics = overviewMetrics(data, '2026-10-31');
  assert.equal(metrics.deliveredThisMonth, 1);
  assert.equal(metrics.deliveredValueCents, 12345);
  assert.equal(metrics.undatedDelivered, 1);
  assert.equal(metrics.overdue, 1);
});

test('the schedule includes today through day six, excludes completed and overdue work', () => {
  const data = empty();
  data.requests = [
    request('late', { status: 'scheduled', plannedIntakeDate: '2026-10-30' }),
    request('today', { status: 'scheduled', plannedIntakeDate: '2026-10-31' }),
    request('last', { status: 'scheduled', plannedIntakeDate: '2026-11-06' }),
    request('next-week', { status: 'scheduled', plannedIntakeDate: '2026-11-07' }),
    request('converted', { status: 'converted', plannedIntakeDate: '2026-11-01' })
  ];
  data.orders = [
    order('out', { plannedDeliveryDate: '2026-11-02' }),
    order('done', {
      status: 'delivered',
      actualDeliveryDate: '2026-10-31',
      plannedDeliveryDate: '2026-11-01'
    }),
    order('ready', { status: 'ready' })
  ];
  const metrics = overviewMetrics(data, '2026-10-31');
  assert.deepEqual(
    metrics.schedule.map((entry) => entry.target.record.id),
    ['today', 'out', 'last']
  );
  assert.deepEqual(
    metrics.schedule.map((entry) => entry.kind),
    ['intake', 'delivery', 'intake']
  );
  assert.deepEqual(
    metrics.attention.map((target) => target.record.id),
    ['late', 'ready']
  );
  assert.equal(data.requests[0].plannedIntakeDate, '2026-10-30');
});

test('creation history groups UTC timestamps by Kyiv month and omits future dates', () => {
  const data = empty();
  data.requests = [
    request('boundary', { createdAt: '2026-09-30T21:30:00Z' }),
    request('older', { createdAt: '2026-09-30T19:00:00Z' }),
    request('future', { createdAt: '2026-10-02T10:00:00Z' })
  ];
  const metrics = overviewMetrics(data, '2026-10-01');
  assert.equal(metrics.activity.at(-1)?.requests, 1);
  assert.equal(metrics.activity.at(-2)?.requests, 1);
});

test('recent orders use creation date then number, without mutating the workspace', () => {
  const data = empty();
  data.orders = Array.from({ length: 8 }, (_, index) =>
    order(String(index), { number: index + 1 })
  );
  const before = data.orders.map((entry) => entry.id);
  assert.deepEqual(
    overviewMetrics(data, '2026-10-31').recentOrders.map((entry) => entry.number),
    [8, 7, 6, 5, 4]
  );
  assert.deepEqual(
    data.orders.map((entry) => entry.id),
    before
  );
});
