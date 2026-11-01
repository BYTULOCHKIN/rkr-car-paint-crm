import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CrmRepository } from '../server/repository';
import { vehicleSchema } from '../schemas/crm';
import { readVin, readCatalog } from '../server/vehicle-catalog';

test('an unassigned vehicle has a year and can later be assigned to a real customer', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const id = repository.createVehicle(
      vehicleSchema.parse({
        customerId: '',
        make: 'FORD',
        model: 'Focus',
        year: 2020,
        vin: '',
        plate: ''
      })
    );
    assert.equal(repository.workspace().vehicles[0].customerId, null);
    assert.equal(repository.workspace().vehicles[0].year, 2020);
    const customerId = repository.createCustomer({
      name: 'Клієнт',
      phone: '0501234567',
      notes: ''
    });
    repository.assignVehicle(id, customerId);
    assert.equal(repository.workspace().vehicles[0].customerId, customerId);
    assert.equal(
      vehicleSchema.safeParse({ customerId: '', make: 'FORD', model: 'Focus', vin: '', plate: '' })
        .success,
      false
    );
  } finally {
    repository.close();
  }
});

test('VIN adapter maps partial provider results and catalog falls back on outages', async () => {
  const fetcher = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ Results: [{ Make: 'BMW', Model: 'X3', ModelYear: '2011' }] }), {
        status: 200
      });
    const result = await readVin('5UXWX7C50BA123456');
    assert.equal(result.make, 'BMW');
    assert.equal(result.year, 2011);
    globalThis.fetch = async () => {
      throw new Error('offline');
    };
    const catalog = await readCatalog('VOLKSWAGEN');
    assert.ok(catalog.models.includes('Golf'));
    assert.ok(catalog.warning);
  } finally {
    globalThis.fetch = fetcher;
  }
});

test('vehicle editing persists fields and deletion removes only unused cars', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const input = { customerId: '', make: 'FORD', model: 'Focus', year: 2020, vin: '', plate: '' };
    const id = repository.createVehicle(input);
    repository.updateVehicle(id, { ...input, year: 2021, plate: 'AA1234BC' });
    assert.equal(repository.workspace().vehicles[0].year, 2021);
    assert.equal(repository.workspace().vehicles[0].plate, 'AA1234BC');
    repository.deleteVehicle(id);
    assert.equal(repository.workspace().vehicles.length, 0);
    assert.throws(() => repository.deleteVehicle(id), /не знайдено/);
  } finally {
    repository.close();
  }
});

test('history protects vehicle identity and deletion, while allowing corrections and adding a missing VIN', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const customerId = repository.createCustomer({
      name: 'Клієнт',
      phone: '0501234567',
      notes: ''
    });
    const input = { customerId, make: 'FORD', model: 'Focus', year: 2020, vin: '', plate: '' };
    const id = repository.createVehicle(input);
    repository.createRequest({ customerId, vehicleId: id, description: 'Ремонт' });
    assert.throws(() => repository.deleteVehicle(id), /історію/);
    repository.updateVehicle(id, { ...input, vin: 'WVWZZZ1JZXW000001' });
    assert.throws(
      () => repository.updateVehicle(id, { ...input, vin: 'WVWZZZ1JZXW000002' }),
      /історію/
    );
    assert.throws(() => repository.updateVin(id, 'WVWZZZ1JZXW000002'), /історією/);
    assert.throws(
      () => repository.updateVehicle(id, { ...input, customerId: '', vin: 'WVWZZZ1JZXW000001' }),
      /історію/
    );
    repository.updateVehicle(id, { ...input, vin: 'WVWZZZ1JZXW000001', plate: 'AA1234BC' });
    assert.equal(repository.workspace().requests.length, 1);
    assert.equal(repository.workspace().vehicles[0].plate, 'AA1234BC');
  } finally {
    repository.close();
  }
});
