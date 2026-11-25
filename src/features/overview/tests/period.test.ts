import assert from 'node:assert/strict';
import test from 'node:test';
import type { CrmWorkspace, RepairOrder, PaymentEvent } from '@/features/crm/api/types';
import {
  currentOverviewMonth,
  previousOverviewMonth,
  comparisonPeriod,
  timestampDay
} from '../lib/period';
import { overviewFacts, matchesOverviewOrder, overviewPeriodTotals } from '../lib/cohorts';
import { overviewPeriodMetrics, overviewPeriodTrends } from '../lib/period-metrics';
import { overviewPeriodSchema } from '../schemas/period';
import { crmListSchema } from '@/features/crm/schemas/reads';
import { compareMetric } from '../lib/trends';

test('period presets and comparison handle leap years, January and inclusive custom ranges', () => {
  assert.deepEqual(currentOverviewMonth('2026-11-25'), { from: '2026-11-01', to: '2026-11-25' });
  assert.deepEqual(previousOverviewMonth('2027-01-01'), { from: '2026-12-01', to: '2026-12-31' });
  assert.deepEqual(previousOverviewMonth('2024-03-20'), { from: '2024-02-01', to: '2024-02-29' });
  assert.deepEqual(comparisonPeriod({ from: '2024-03-01', to: '2024-03-30' }, '2024-03-30'), {
    from: '2024-02-01',
    to: '2024-02-29'
  });
  assert.deepEqual(comparisonPeriod({ from: '2026-10-01', to: '2026-10-31' }, '2026-11-25'), {
    from: '2026-09-01',
    to: '2026-09-30'
  });
  assert.deepEqual(comparisonPeriod({ from: '2026-11-10', to: '2026-11-12' }, '2026-11-25'), {
    from: '2026-11-07',
    to: '2026-11-09'
  });
  assert.equal(timestampDay('2026-10-31T23:30:00Z'), '2026-11-01');
  assert.equal(timestampDay('invalid'), null);
  assert.equal(
    overviewPeriodSchema.safeParse({ from: '2026-11-12', to: '2026-11-10' }).success,
    false
  );
  assert.equal(
    overviewPeriodSchema.safeParse({ from: '2026-02-30', to: '2026-03-01' }).success,
    false
  );
  assert.equal(
    crmListSchema.safeParse({ entity: 'orders', overviewMetric: 'profit' }).success,
    false
  );
  assert.equal(
    crmListSchema.safeParse({
      entity: 'customers',
      overviewMetric: 'profit',
      overviewFrom: '2026-11-01',
      overviewTo: '2026-11-25'
    }).success,
    false
  );
});

function order(id: string, values: Partial<RepairOrder> = {}): RepairOrder {
  return {
    id,
    number: 1,
    customerId: 'customer',
    vehicleId: 'vehicle',
    requestId: null,
    description: 'Ремонт',
    status: 'ready',
    createdAt: '2026-10-01T10:00:00Z',
    plannedIntakeDate: null,
    plannedDeliveryDate: null,
    actualIntakeDate: null,
    actualReadyDate: '2026-11-01',
    actualDeliveryDate: null,
    totalCents: 2000000,
    items: [],
    ...values
  };
}
function payment(
  id: string,
  orderId: string,
  amountCents: number,
  values: Partial<PaymentEvent> = {}
): PaymentEvent {
  return {
    id,
    operationId: id,
    orderId,
    amountCents,
    kind: 'payment',
    createdAt: '2026-11-10T10:00:00Z',
    note: '',
    reversalOf: null,
    actor: { id: 'admin', name: 'Адмін' },
    ...values
  };
}
const period = { from: '2026-11-01', to: '2026-11-30' };

test('profit uses ready-date economics independently of cash; debt uses current balances', () => {
  const data: CrmWorkspace = {
    customers: [],
    vehicles: [],
    requests: [],
    events: [],
    orders: [
      order('ready'),
      order('loss'),
      order('missing'),
      order('old', { actualReadyDate: '2026-10-31' }),
      order('open', {
        status: 'in_progress',
        actualReadyDate: null,
        createdAt: '2026-11-01T00:00:00Z'
      }),
      order('old-open', { status: 'created', actualReadyDate: null }),
      order('undated', { actualReadyDate: null }),
      order('deleted', { deletedAt: '2026-11-15T00:00:00Z' })
    ],
    orderProfits: { ready: 810000, loss: -100000, old: 400000, deleted: 900000 },
    payments: [
      payment('later', 'ready', 1000000, { createdAt: '2026-12-05T10:00:00Z' }),
      payment('old-cash', 'old', 500000),
      payment('refund', 'old', 100000, { kind: 'refund' }),
      payment('cancelled', 'old', 50000),
      payment('cancel', 'old', 50000, {
        kind: 'reversal',
        reversalOf: 'cancelled',
        createdAt: '2026-12-01T10:00:00Z'
      }),
      payment('deleted-cash', 'deleted', 900000)
    ]
  };
  const facts = overviewFacts(data);
  const totals = overviewPeriodTotals(facts, period);
  assert.deepEqual(totals, {
    deliveredThisMonth: 3,
    deliveredValueCents: 6000000,
    monthlyReceiptsCents: 400000,
    debtCents: 5000000,
    debtOrderCount: 3,
    pendingPaymentCents: 2000000,
    profitCents: 710000,
    unpostedProfitCount: 1
  });
  const ids = (metric: Parameters<typeof matchesOverviewOrder>[2]) =>
    facts.orders
      .filter((fact) => matchesOverviewOrder(fact, facts, metric, period))
      .map((fact) => fact.order.id);
  assert.deepEqual(ids('receipts'), ['old']);
  assert.deepEqual(ids('profit'), ['ready', 'loss']);
  assert.deepEqual(ids('unposted'), ['missing']);
  assert.deepEqual(ids('open_debt'), ['open']);
  const metrics = overviewPeriodMetrics(data, '2026-12-15', period);
  const other = overviewPeriodMetrics(data, '2026-12-15', { from: '2026-10-01', to: '2026-10-31' });
  assert.equal(metrics.inProgress, other.inProgress);
  assert.equal(metrics.ready, other.ready);
  assert.equal(metrics.recentOrders.length, 1);
  assert.equal(
    metrics.activity.reduce((sum, day) => sum + day.orders, 0),
    1
  );
  assert.equal(
    overviewPeriodTrends(data, '2026-12-15', period, metrics).metrics.profitCents.current,
    710000
  );
  assert.equal(compareMetric(-5000, -10000).percentage, 50);
  assert.equal(
    overviewPeriodTrends(data, '2026-12-15', period, metrics).metrics.profitCents.comparison,
    'unknown'
  );
  data.orderProfits!.ready = 600000;
  assert.equal(overviewPeriodMetrics(data, '2026-12-15', period).profitCents, 500000);
});
