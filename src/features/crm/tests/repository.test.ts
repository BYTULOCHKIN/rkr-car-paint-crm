import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { CrmRepository } from '../server/repository';
import { customerSchema, vehicleSchema, orderSchema, vinSchema } from '../schemas/crm';

const repositories: CrmRepository[] = [];
afterEach(() => {
  repositories.splice(0).forEach((repository) => repository.close());
});

function setup(vin = '') {
  const repository = new CrmRepository(':memory:');
  repositories.push(repository);
  const customerId = repository.createCustomer(
    customerSchema.parse({ name: 'Олена', phone: '+380501234567', notes: '' })
  );
  const vehicleId = repository.createVehicle(
    vehicleSchema.parse({
      customerId,
      year: 2020,
      make: 'Volkswagen',
      model: 'Golf',
      plate: 'AA1234BC',
      vin
    })
  );
  return { repository, customerId, vehicleId };
}

const items = [{ description: 'Фарбування бампера', quantity: 2, unitPrice: 1250.55 }];

test('backlog accepts a vehicle without VIN; order requires VIN and conversion is atomic', () => {
  const { repository, customerId, vehicleId } = setup();
  const requestId = repository.createRequest({
    customerId,
    vehicleId,
    description: 'Ремонт бампера'
  });
  const input = orderSchema.parse({
    customerId,
    vehicleId,
    requestId,
    description: 'Ремонт бампера',
    items
  });
  assert.throws(() => repository.createOrder(input), /VIN/);
  assert.equal(repository.workspace().requests[0].status, 'backlog');
  assert.equal(repository.workspace().orders.length, 0);
  repository.updateVin(vehicleId, vinSchema.parse(' wvwzzz1jzxw000001 '));
  const orderId = repository.createOrder(input);
  const workspace = repository.workspace();
  for (const row of [
    ...workspace.customers,
    ...workspace.vehicles,
    ...workspace.requests,
    ...workspace.orders
  ]) {
    assert.equal(
      Object.getPrototypeOf(row),
      Object.prototype,
      'Server Actions require plain objects'
    );
  }
  assert.equal(workspace.requests[0].status, 'converted');
  assert.equal(workspace.orders[0].id, orderId);
  assert.equal(workspace.orders[0].requestId, requestId);
  assert.equal(workspace.orders[0].totalCents, 250110);
  assert.throws(() => repository.createOrder(input), /взято в роботу/);
  assert.equal(repository.workspace().orders.length, 1);
});

test('a client has multiple cars; VIN is normalized and unique', () => {
  const { repository, customerId } = setup('WVWZZZ1JZXW000001');
  const input = {
    customerId,
    year: 2020,
    make: 'BMW',
    model: '320',
    plate: '',
    vin: 'wvwzzz1jzxw000001'
  };
  assert.throws(() => repository.createVehicle(vehicleSchema.parse(input)), /VIN уже існує/);
  repository.createVehicle(vehicleSchema.parse({ ...input, vin: 'WBAAA12345BB00002' }));
  assert.equal(repository.workspace().vehicles.length, 2);
  assert.equal(repository.workspace().vehicles[0].customerId, customerId);
  assert.equal(vinSchema.safeParse('INVALID').success, false);
  assert.equal(vinSchema.safeParse('WVWZZZ1JZXW00000I').success, false);
});

test('orders can be created directly and edited; amounts are stored as integer kopecks', () => {
  const { repository, customerId, vehicleId } = setup('WVWZZZ1JZXW000001');
  const id = repository.createOrder(
    orderSchema.parse({ customerId, vehicleId, requestId: '', description: 'Рихтування', items })
  );
  repository.updateOrder({
    id,
    description: 'Додано полірування',
    items: [
      { description: 'Полірування', quantity: 3, unitPrice: 0.1 },
      { description: 'Рихтування', quantity: 1, unitPrice: 99.99 }
    ]
  });
  const order = repository.workspace().orders[0];
  assert.equal(order.requestId, null);
  assert.equal(order.totalCents, 10029);
  assert.equal(order.items.length, 2);
  assert.equal(repository.workspace().requests.length, 0);
});

test('customer/vehicle mismatch and forged conversions are rejected', () => {
  const { repository, customerId, vehicleId } = setup('WVWZZZ1JZXW000001');
  const other = repository.createCustomer({ name: 'Інший клієнт', phone: '0501234567', notes: '' });
  assert.throws(
    () => repository.createRequest({ customerId: other, vehicleId, description: 'Test' }),
    /не належить/
  );
  const requestId = repository.createRequest({ customerId, vehicleId, description: 'Test' });
  const secondVehicle = repository.createVehicle({
    customerId,
    year: 2020,
    make: 'BMW',
    model: '320',
    plate: '',
    vin: 'WBAAA12345BB00002'
  });
  assert.throws(
    () =>
      repository.createOrder({
        customerId,
        vehicleId: secondVehicle,
        requestId,
        description: 'Test',
        items
      }),
    /іншому авто/
  );
  assert.equal(repository.workspace().orders.length, 0);
});

test('failure writing order items rolls back both order and backlog status', () => {
  const { repository, customerId, vehicleId } = setup('WVWZZZ1JZXW000001');
  const requestId = repository.createRequest({ customerId, vehicleId, description: 'Test' });
  assert.throws(() =>
    repository.createOrder({
      customerId,
      vehicleId,
      requestId,
      description: 'Test',
      items: [{ description: 'Invalid', quantity: -1, unitPrice: 10 }]
    })
  );
  assert.equal(repository.workspace().orders.length, 0);
  assert.equal(repository.workspace().requests[0].status, 'backlog');
});

test('invalid amounts and empty line items fail input validation', () => {
  const { customerId, vehicleId } = setup();
  const input = { customerId, vehicleId, requestId: '', description: 'Test', items };
  for (const invalid of [
    [],
    [{ ...items[0], unitPrice: -1 }],
    [{ ...items[0], unitPrice: 0.001 }],
    [{ ...items[0], quantity: 0 }],
    [{ ...items[0], quantity: 1.5 }]
  ]) {
    assert.equal(orderSchema.safeParse({ ...input, items: invalid }).success, false);
  }
});

test('single administrator is enforced, including before initial claim', () => {
  const { repository } = setup();
  assert.throws(() => repository.authorize('other', 'admin'), /лише адміністратор/);
  repository.authorize('admin', 'admin');
  repository.authorize('admin');
  assert.throws(() => repository.authorize('other'), /лише адміністратор/);
});

test('customers, cars, orders and admin ownership survive closing and reopening the database', () => {
  const folder = mkdtempSync(join(tmpdir(), 'autopaint-crm-'));
  const filename = join(folder, 'test.sqlite');
  let repository = new CrmRepository(filename);
  try {
    repository.authorize('admin');
    const customerId = repository.createCustomer({
      name: 'Клієнт',
      phone: '0501234567',
      notes: ''
    });
    const vehicleId = repository.createVehicle({
      customerId,
      year: 2020,
      make: 'Ford',
      model: 'Focus',
      plate: '',
      vin: 'WVWZZZ1JZXW000001'
    });
    repository.createOrder({ customerId, vehicleId, requestId: '', description: 'Ремонт', items });
    repository.close();
    repository = new CrmRepository(filename);
    assert.equal(repository.workspace().orders[0].totalCents, 250110);
    assert.equal(repository.workspace().customers[0].name, 'Клієнт');
    assert.throws(() => repository.authorize('other'), /лише адміністратор/);
  } finally {
    repository.close();
    assert.equal(dirname(resolve(folder)), resolve(tmpdir()));
    assert.ok(basename(folder).startsWith('autopaint-crm-'));
    rmSync(folder, { recursive: true, force: true });
  }
});
