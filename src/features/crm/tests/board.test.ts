import assert from 'node:assert/strict';
import test from 'node:test';
import type { CrmWorkspace, RepairOrder } from '../api/types';
import { batchBoard, filterBoard, indexBoard } from '../lib/board';

function workspace(): CrmWorkspace {
  const order: RepairOrder = {
    id: 'order',
    number: 1,
    requestId: null,
    customerId: 'a',
    vehicleId: 'a',
    status: 'created',
    description: 'Фарбування дверей',
    createdAt: '2026-11-01T10:00:00Z',
    plannedIntakeDate: null,
    plannedDeliveryDate: '2026-12-02',
    actualIntakeDate: null,
    actualReadyDate: null,
    actualDeliveryDate: null,
    items: [],
    totalCents: 0
  };
  return {
    customers: [
      { id: 'a', name: 'Іван', phone: '0500000000', notes: '', createdAt: '' },
      {
        id: 'b',
        name: 'Олена',
        phone: '0671234567',
        notes: '',
        createdAt: '',
        contacts: [
          { id: 'p', type: 'phone', value: '+38 (067) 123-45-67' },
          { id: 'e', type: 'email', value: 'Paint@Example.com' }
        ]
      }
    ],
    vehicles: [
      {
        id: 'a',
        customerId: 'a',
        make: 'Ford',
        model: 'Focus',
        plate: 'AA',
        vin: null,
        year: 2020
      },
      {
        id: 'b',
        customerId: 'b',
        make: 'Zeekr',
        model: '001',
        plate: 'SPECIAL',
        vin: 'L6T79ZCEXRP120619',
        year: 2024
      }
    ],
    requests: [],
    events: [],
    orders: Array.from({ length: 100 }, (_, index) => ({
      ...order,
      id: `order-${index}`,
      number: index + 1,
      ...(index === 99
        ? { customerId: 'b', vehicleId: 'b', description: 'Полірування', plannedDeliveryDate: null }
        : {})
    }))
  };
}

test('indexed search includes contacts, VIN, make, plate, description and number beyond rendered batches', () => {
  const data = workspace();
  const unchanged = structuredClone(data);
  const index = indexBoard(data);
  const columns = filterBoard(index, '');
  assert.equal(columns.created.length, 100);
  assert.equal(batchBoard(columns).created.length, 25);
  assert.equal(batchBoard(columns, 50).created.length, 50);
  assert.equal(columns.created.length, 100);
  for (const query of [
    ' PAINT@example.COM ',
    '380671234567',
    'Олена',
    'zeekr',
    'SPECIAL',
    'L6T79ZCEXRP120619',
    'Полірування',
    '100'
  ]) {
    const result = filterBoard(index, query).created;
    assert.equal(result.length, 1, query);
    assert.equal(result[0].target.record.id, 'order-99');
    assert.equal(batchBoard(filterBoard(index, query)).created.length, 1);
  }
  assert.equal(index.at(-1)?.target.record.id, 'order-99');
  assert.deepEqual(data, unchanged);
});

test('legacy requests remain archived and all board indexes contain only orders', () => {
  const data = workspace();
  data.requests = [
    {
      id: 'request',
      customerId: 'a',
      vehicleId: 'a',
      description: 'Заявка',
      status: 'scheduled',
      plannedIntakeDate: '2026-01-01',
      plannedDeliveryDate: null,
      createdAt: ''
    }
  ];
  assert.equal(indexBoard(data).length, 100);
  assert.ok(indexBoard(data).every((card) => card.target.kind === 'order'));
  data.orders[0].requestId = 'request';
  assert.equal(indexBoard(data).length, 100);
  data.orders[0].requestId = null;
  data.access = { userId: 'worker', orgId: 'org', role: 'worker' };
  assert.equal(indexBoard(data).length, 100);
  assert.ok(indexBoard(data).every((card) => card.target.kind === 'order'));
});
