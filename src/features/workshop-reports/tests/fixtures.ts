import type { CrmWorkspace, RepairOrder, CrmAccess } from '@/features/crm/api/types';
import type { StockMovement } from '@/features/inventory/api/types';
import type {
  EconomicsPosting,
  SettlementEvent,
  OrderEconomicsDetails
} from '@/features/order-economics/api/types';
import { previewDetailedEconomics } from '@/features/order-economics/lib/details';

export const admin: CrmAccess = { userId: 'owner', orgId: 'org_A', role: 'admin' };
export const worker: CrmAccess = { userId: 'p', orgId: 'org_A', role: 'worker' };
const actor = { id: 'owner', name: 'Адміністратор' };
const fixtureOrder = (id: string, number: number, ready: string): RepairOrder => ({
  id,
  number,
  requestId: null,
  customerId: 'c',
  vehicleId: `v${number}`,
  description: 'Роботи',
  createdAt: number === 1 ? '2026-10-20T10:00:00Z' : '2026-11-02T10:00:00Z',
  status: 'ready',
  plannedIntakeDate: null,
  plannedDeliveryDate: null,
  actualIntakeDate: '2026-11-01',
  actualReadyDate: ready,
  actualDeliveryDate: null,
  items: [{ description: 'Бампер', quantity: 1, unitPriceCents: 1800000 }],
  totalCents: 1800000
});
export function reportFixture(): { workspace: CrmWorkspace; movements: StockMovement[] } {
  const details: OrderEconomicsDetails = {
    employeeShareBps: 6000,
    painterId: 'p',
    polisherId: 'q',
    assemblerId: '',
    painterName: 'Маляр',
    polisherName: 'Полірувальник',
    lines: [
      {
        id: 'line',
        kind: 'painting',
        description: 'Бампер',
        quantity: 1,
        unitPriceCents: 1800000,
        polishingCents: 100000,
        subcontractCostCents: 0,
        contractorName: ''
      }
    ]
  };
  const posting = (revision: number, date: string, paintingCents: number): EconomicsPosting => {
    const costs = {
      paintingCents,
      polishingCents: 50000,
      totalCents: paintingCents + 50000,
      unallocatedCents: 0
    };
    const result = previewDetailedEconomics(details, costs).result!;
    return {
      id: `posting${revision}`,
      orderId: 'a',
      operationId: `op${revision}`,
      revision,
      kind: revision === 1 ? 'initial' : 'correction',
      createdAt: date,
      details,
      costs,
      result,
      allocations: [
        {
          payee: { kind: 'worker', id: 'p', name: 'Маляр' },
          amountCents: result.painterAccrualCents
        },
        {
          payee: { kind: 'worker', id: 'q', name: 'Полірувальник' },
          amountCents: result.polisherAccrualCents
        }
      ],
      actor,
      note: revision === 1 ? 'Готовність авто' : 'Уточнені матеріали'
    };
  };
  const cash = (
    id: string,
    orderId: string,
    kind: SettlementEvent['kind'],
    amountCents: number,
    createdAt: string,
    payeeId = 'p'
  ): SettlementEvent => ({
    id,
    orderId,
    kind,
    amountCents,
    createdAt,
    payee: { kind: 'worker', id: payeeId, name: payeeId === 'p' ? 'Маляр' : 'Полірувальник' },
    postingId: null,
    reversalOf: null,
    note: '',
    actor
  });
  const postings = [
    posting(1, '2026-11-30T21:59:00Z', 300000),
    posting(2, '2026-11-30T22:00:00Z', 400000),
    posting(3, '2027-01-01T10:00:00Z', 500000)
  ];
  const workspace: CrmWorkspace = {
    customers: [{ id: 'c', name: 'Клієнт', phone: '', notes: '', createdAt: '2026-10-01' }],
    vehicles: [1, 2, 3].map((number) => ({
      id: `v${number}`,
      customerId: 'c',
      make: 'Ford',
      model: `Focus ${number}`,
      year: 2020,
      plate: `AA${number}`,
      vin: null
    })),
    orders: [
      fixtureOrder('a', 1, '2026-11-30'),
      fixtureOrder('b', 2, '2026-12-01'),
      fixtureOrder('legacy', 3, '2026-11-03')
    ],
    requests: [],
    events: [],
    finance: {
      defaultShareBps: 6000,
      settingsRevision: 0,
      inventoryRevision: '0'.repeat(64),
      postings,
      events: [
        cash('advance', 'a', 'payout', 200000, '2026-10-30T10:00:00Z'),
        cash('accrual', 'a', 'accrual', 840000, postings[0].createdAt),
        cash('polisher', 'a', 'accrual', 30000, postings[0].createdAt, 'q'),
        cash('payout', 'a', 'payout', 640000, postings[0].createdAt),
        cash('advance-b', 'b', 'payout', 300000, '2026-11-15T10:00:00Z'),
        cash('adjustment', 'a', 'adjustment', -60000, postings[1].createdAt),
        {
          ...cash('reversal', 'a', 'reversal', 640000, '2026-12-15T10:00:00Z'),
          reversalOf: 'payout'
        },
        cash('future', 'a', 'adjustment', -60000, postings[2].createdAt)
      ]
    },
    payments: [
      {
        id: 'receipt',
        operationId: 'receipt',
        orderId: 'a',
        kind: 'payment',
        amountCents: 1800000,
        reversalOf: null,
        note: '',
        actor,
        createdAt: postings[0].createdAt
      },
      {
        id: 'refund',
        operationId: 'refund',
        orderId: 'a',
        kind: 'refund',
        amountCents: 40000,
        reversalOf: null,
        note: 'Повернуто клієнту',
        actor,
        createdAt: '2026-12-02T10:00:00Z'
      },
      {
        id: 'receipt-b',
        operationId: 'receipt-b',
        orderId: 'b',
        kind: 'payment',
        amountCents: 100000,
        reversalOf: null,
        note: '',
        actor,
        createdAt: '2026-11-15T10:00:00Z'
      },
      {
        id: 'cancel-b',
        operationId: 'cancel-b',
        orderId: 'b',
        kind: 'reversal',
        amountCents: 100000,
        reversalOf: 'receipt-b',
        note: 'Помилкова оплата',
        actor,
        createdAt: '2026-12-03T10:00:00Z'
      }
    ]
  };
  const movement = (
    id: string,
    orderId: string,
    cost: number | null,
    quantity: number,
    createdAt: string
  ): StockMovement => ({
    id,
    orderId,
    itemId: id.startsWith('unknown') ? 'lacquer' : 'paint',
    itemName: id.startsWith('unknown') ? 'Лак' : 'Фарба',
    unit: 'л',
    kind: 'consumption',
    deltaMilli: -quantity,
    costDeltaCents: cost === null ? null : -cost,
    orderNumber: orderId === 'a' ? 1 : 3,
    category: 'painting',
    currency: null,
    purchaseAmountMinor: null,
    exchangeRateMicros: null,
    valuationTotalCents: null,
    reversesId: null,
    reversed: false,
    note: '',
    actor,
    createdAt
  });
  const unknown = movement('unknown', 'legacy', null, 800, '2026-11-02T10:00:00Z');
  return {
    workspace,
    movements: [
      movement('paint', 'a', 300000, 3000, '2026-11-05T10:00:00Z'),
      movement('extra', 'a', 100000, 1000, postings[1].createdAt),
      { ...unknown, reversed: true },
      {
        ...unknown,
        id: 'unknown-return',
        kind: 'reversal',
        deltaMilli: 800,
        reversesId: unknown.id,
        createdAt: '2026-12-02T10:00:00Z'
      }
    ]
  };
}
