import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  CrmWorkspace,
  RepairOrder,
  WorkflowEvent,
  PaymentEvent
} from '@/features/crm/api/types';
import { overviewTrends, monthComparison, compareMetric } from '../lib/trends';
import { overviewMetrics } from '../lib/metrics';

const empty = (): CrmWorkspace => ({
  customers: [],
  vehicles: [],
  requests: [],
  orders: [],
  events: [],
  payments: []
});
const order = (values: Partial<RepairOrder> = {}): RepairOrder => ({
  id: 'order',
  number: 1,
  customerId: 'customer',
  vehicleId: 'car',
  requestId: null,
  description: 'Робота',
  createdAt: '2026-09-01T10:00:00Z',
  status: 'in_progress',
  actualIntakeDate: '2026-09-01',
  actualReadyDate: null,
  actualDeliveryDate: null,
  plannedIntakeDate: null,
  plannedDeliveryDate: null,
  items: [],
  totalCents: 10000,
  ...values
});
const event = (
  id: string,
  date: string,
  from: string | null,
  to: string,
  more: Partial<WorkflowEvent> = {}
): WorkflowEvent => ({
  id,
  kind: 'order',
  recordId: 'order',
  createdAt: `${date}T10:00:00Z`,
  fromStatus: from,
  toStatus: to,
  previousIntakeDate: null,
  previousDeliveryDate: null,
  plannedIntakeDate: null,
  plannedDeliveryDate: null,
  note: '',
  ...more
});
const payment = (
  id: string,
  date: string,
  amountCents: number,
  more: Partial<PaymentEvent> = {}
): PaymentEvent => ({
  id,
  operationId: id,
  orderId: 'order',
  createdAt: `${date}T12:00:00Z`,
  amountCents,
  kind: 'payment',
  reversalOf: null,
  note: '',
  actor: { id: 'admin', name: 'Адмін' },
  ...more
});

test('month comparison clamps short months, supports leap years and crosses year boundaries', () => {
  assert.equal(monthComparison('2028-03-31').previousEnd, '2028-02-29');
  assert.equal(monthComparison('2027-03-31').previousEnd, '2027-02-28');
  assert.deepEqual(monthComparison('2027-01-17'), {
    start: '2027-01-01',
    end: '2027-01-17',
    previousStart: '2026-12-01',
    previousEnd: '2026-12-17'
  });
  assert.equal(monthComparison('2026-11-17').previousEnd, '2026-10-17');
});

test('zero comparisons never produce Infinity, fabricated 100%, or NaN', () => {
  assert.deepEqual(compareMetric(0, 0), { percentage: 0, comparison: 'percent' });
  assert.deepEqual(compareMetric(50, 0), { percentage: null, comparison: 'new' });
  assert.deepEqual(compareMetric(50, null), { percentage: null, comparison: 'unknown' });
  assert.equal(compareMetric(0, 50).percentage, -100);
  assert.equal(compareMetric(75, 50).percentage, 50);
});

test('status snapshots, old prices and active payments drive daily balances and month-to-date comparison', () => {
  const data = empty();
  data.orders = [
    order({
      status: 'delivered',
      actualReadyDate: '2026-11-05',
      actualDeliveryDate: '2026-11-06',
      totalCents: 20000
    })
  ];
  const snapshot = { description: 'Робота', items: [], paintPlan: [], totalCents: 10000 };
  data.events = [
    event('price', '2026-11-10', 'delivered', 'delivered', {
      orderChanges: { before: snapshot, after: { ...snapshot, totalCents: 20000 } }
    }),
    event('delivered', '2026-11-06', 'ready', 'delivered'),
    event('ready', '2026-11-05', 'in_progress', 'ready'),
    event('created', '2026-09-01', null, 'in_progress')
  ];
  data.payments = [
    payment('old', '2026-10-05', 4000),
    payment('mistake', '2026-11-03', 2000),
    payment('new', '2026-11-07', 3000),
    payment('cancel', '2026-11-12', 2000, { kind: 'reversal', reversalOf: 'mistake' })
  ];
  const before = JSON.stringify(data);
  const trends = overviewTrends(data, '2026-11-17');
  assert.equal(trends.metrics.monthlyReceiptsCents.current, 3000);
  assert.equal(trends.metrics.monthlyReceiptsCents.previous, 4000);
  assert.equal(trends.metrics.monthlyReceiptsCents.percentage, -25);
  assert.equal(trends.metrics.inProgress.previous, 1);
  assert.equal(trends.metrics.pendingPaymentCents.previous, 6000);
  assert.equal(
    trends.metrics.debtCents.points.find((point) => point.date === '2026-11-06')!.value,
    6000
  );
  assert.equal(
    trends.metrics.debtCents.points.find((point) => point.date === '2026-11-07')!.value,
    3000
  );
  assert.equal(
    trends.metrics.debtCents.points.find((point) => point.date === '2026-11-10')!.value,
    13000
  );
  assert.equal(trends.metrics.ready.points.find((point) => point.date === '2026-11-05')!.value, 1);
  const current = overviewMetrics(data, '2026-11-17');
  for (const [key, trend] of Object.entries(trends.metrics)) {
    assert.equal(trend.current, current[key as keyof typeof trends.metrics]);
    assert.equal(trend.points.at(-1)!.value, trend.current);
    assert.equal(trend.points.length, 17);
  }
  assert.equal(JSON.stringify(data), before);
});

test('unknown legacy status produces a history gap instead of invented zero', () => {
  const data = empty();
  data.orders = [order({ status: 'delivered', actualIntakeDate: null, actualDeliveryDate: null })];
  const trends = overviewTrends(data, '2026-11-17');
  assert.equal(trends.metrics.debtCents.previous, null);
  assert.equal(trends.metrics.debtCents.comparison, 'unknown');
  assert.equal(trends.metrics.debtCents.points[0].value, null);
  assert.equal(trends.metrics.debtCents.points.at(-1)!.value, 10000);
});

test('conversion history avoids double counting and Kyiv timestamps choose the correct month', () => {
  const data = empty();
  data.requests = [
    {
      id: 'request',
      customerId: 'customer',
      vehicleId: 'car',
      description: 'Робота',
      createdAt: '2026-10-01T10:00:00Z',
      status: 'converted',
      plannedIntakeDate: null,
      plannedDeliveryDate: null
    }
  ];
  data.orders = [order({ requestId: 'request', createdAt: '2026-11-05T10:00:00Z' })];
  data.payments = [payment('boundary', '2026-10-31', 1000, { createdAt: '2026-10-31T22:30:00Z' })];
  const trends = overviewTrends(data, '2026-11-17');
  assert.equal(trends.metrics.activeRequests.previous, 1);
  assert.equal(trends.metrics.activeRequests.points[3].value, 1);
  assert.equal(trends.metrics.activeRequests.points[4].value, 0);
  assert.equal(trends.metrics.monthlyReceiptsCents.points[0].value, 1000);
  const firstDay = overviewTrends(empty(), '2026-11-01');
  assert.equal(firstDay.metrics.activeRequests.points.length, 1);
  assert.equal(firstDay.metrics.activeRequests.percentage, 0);
});
