import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { historyOrderChanges } from '../lib/workflow-history';
import {
  CrmRepository,
  OrganizationRepositories,
  getOrganizationRepository
} from '../server/repository';

test('organization cache reopens repositories from an older app version and preserves their data', () => {
  const directory = mkdtempSync(join(tmpdir(), 'crm-schema-cache-'));
  const filename = join(directory, 'crm.sqlite');
  const holder = globalThis as unknown as {
    crmOrganizations?: {
      filename: string;
      configuredAdmin?: string;
      schemaVersion?: number;
      repositories: OrganizationRepositories;
    };
  };
  const previous = holder.crmOrganizations;
  const databasePath = process.env.CRM_DATABASE_PATH;
  const configuredAdmin = process.env.CRM_ADMIN_USER_ID;
  const oldRegistry = new OrganizationRepositories(filename);
  const oldRepository = oldRegistry.forOrganization('org_A', 'owner', true);
  const customerId = oldRepository.createCustomer({
    name: 'Існуючий клієнт',
    phone: '0501234567',
    notes: ''
  });
  const itemId = oldRepository.inventory.createItem({ name: 'Лак', unit: 'л', notes: '' });
  holder.crmOrganizations = { filename, repositories: oldRegistry };
  process.env.CRM_DATABASE_PATH = filename;
  delete process.env.CRM_ADMIN_USER_ID;
  try {
    const reopened = getOrganizationRepository('org_A', 'owner', true);
    assert.notEqual(reopened, oldRepository);
    assert.throws(() => oldRepository.workspace());
    assert.equal(reopened.workspace().customers[0].id, customerId);
    const item = reopened.inventory.items().find((entry) => entry.id === itemId)!;
    assert.equal(item.totalCostCents, 0);
    assert.equal(item.valuationRevision, 0);
    assert.equal(getOrganizationRepository('org_A', 'owner', true), reopened);
    assert.equal(holder.crmOrganizations?.schemaVersion, 22);
  } finally {
    holder.crmOrganizations?.repositories.close();
    holder.crmOrganizations = previous;
    if (databasePath === undefined) delete process.env.CRM_DATABASE_PATH;
    else process.env.CRM_DATABASE_PATH = databasePath;
    if (configuredAdmin === undefined) delete process.env.CRM_ADMIN_USER_ID;
    else process.env.CRM_ADMIN_USER_ID = configuredAdmin;
    rmSync(directory, { recursive: true, force: true });
  }
});

test('only legacy owner can bind existing data, other organizations remain isolated across reopen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crm-organizations-'));
  const filename = join(dir, 'crm.sqlite');
  const old = new CrmRepository(filename);
  old.authorize('user_owner');
  const id = old.createCustomer({ name: 'Старий клієнт', phone: '0501234567', notes: '' });
  old.close();
  let registry = new OrganizationRepositories(filename);
  try {
    const b = registry.forOrganization('org_B', 'user_other', true);
    assert.equal(b.workspace().customers.length, 0);
    assert.throws(() => b.updateVin(id, 'WVWZZZ1JZXW000001'));
    b.createCustomer({ name: 'Інша автомалярка', phone: '0501234567', notes: '' });
    const a = registry.forOrganization('org_A', 'user_owner', true);
    assert.equal(a.workspace().customers[0].id, id);
    assert.equal(
      registry.forOrganization('org_A', 'user_member', false).workspace().customers.length,
      1
    );
    assert.equal(
      registry.forOrganization('org_C', 'user_owner', true).workspace().customers.length,
      0
    );
    assert.throws(() => registry.forOrganization('../../escape', 'user_owner', true));
    registry.close();
    registry = new OrganizationRepositories(filename);
    assert.equal(
      registry.forOrganization('org_A', 'user_owner', true).workspace().customers[0].id,
      id
    );
    assert.equal(
      registry.forOrganization('org_B', 'user_other', true).workspace().customers[0].name,
      'Інша автомалярка'
    );
  } finally {
    registry.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy binding is idempotent and cannot be taken over by another organization', () => {
  const repository = new CrmRepository(':memory:');
  try {
    repository.authorize('user_owner');
    assert.equal(repository.claimOrganization('org_B', 'user_other'), false);
    assert.equal(repository.claimOrganization('org_A', 'user_owner'), true);
    assert.equal(repository.claimOrganization('org_A', 'user_owner'), true);
    assert.equal(repository.claimOrganization('org_B', 'user_owner'), false);
    assert.throws(() => repository.bindOrganization('org_B'));
  } finally {
    repository.close();
  }
});

test('order assignee survives reopening and historical names are kept independently from live membership', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crm-assignee-'));
  const filename = join(dir, 'crm.sqlite');
  let repository = new CrmRepository(filename);
  try {
    const customerId = repository.createCustomer({
      name: 'Клієнт',
      phone: '0501234567',
      notes: ''
    });
    const vehicleId = repository.createVehicle({
      customerId,
      make: 'Ford',
      model: 'Focus',
      year: 2020,
      plate: '',
      vin: 'WVWZZZ1JZXW000001'
    });
    const id = repository.createOrder(
      {
        customerId,
        vehicleId,
        requestId: '',
        assigneeId: 'user_worker',
        description: 'Фарбування',
        items: [{ description: 'Робота', quantity: 1, unitPrice: 100 }]
      },
      'Маляр Андрій'
    );
    repository.close();
    repository = new CrmRepository(filename);
    const order = repository.workspace().orders.find((order) => order.id === id)!;
    assert.equal(order.assigneeId, 'user_worker');
    assert.equal(order.assigneeName, 'Маляр Андрій');
    assert.equal(order.totalCents, 10000);
  } finally {
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('reassignment is atomic, records names and actor, ignores unchanged saves and rejects stale revisions', () => {
  const repository = new CrmRepository(':memory:');
  try {
    const customerId = repository.createCustomer({
      name: 'Клієнт',
      phone: '0501234567',
      notes: ''
    });
    const vehicleId = repository.createVehicle({
      customerId,
      make: 'Ford',
      model: 'Focus',
      year: 2020,
      plate: '',
      vin: 'WVWZZZ1JZXW000001'
    });
    const items = [{ description: 'Фарбування', quantity: 1, unitPrice: 100 }];
    const actor = { id: 'user_owner', name: 'Власник' };
    const id = repository.createOrder(
      {
        customerId,
        vehicleId,
        requestId: '',
        assigneeId: 'user_worker',
        description: 'Роботи',
        items
      },
      'Андрій',
      actor
    );
    const input = {
      id,
      description: 'Роботи',
      items,
      assigneeId: 'user_owner',
      expectedRevision: 0
    };
    repository.updateOrder(input, 'Власник', actor);
    const snapshot = repository.workspace();
    assert.equal(snapshot.orders[0].assigneeName, 'Власник');
    assert.equal(snapshot.orders[0].totalCents, 10000);
    assert.deepEqual(snapshot.events[0].actor, actor);
    assert.deepEqual(historyOrderChanges(snapshot.events[0]), [
      { label: 'Відповідальний', before: 'Андрій', after: 'Власник' }
    ]);
    repository.updateOrder({ ...input, expectedRevision: 1 }, 'Власник', actor);
    assert.equal(repository.workspace().events.length, snapshot.events.length);
    assert.throws(() => repository.updateOrder(input, 'Власник', actor), /іншому вікні/);
    assert.throws(() =>
      repository.updateOrder(
        {
          ...input,
          expectedRevision: 1,
          assigneeId: 'user_worker',
          items: [{ description: 'Помилка', quantity: -1, unitPrice: 1 }]
        },
        'Андрій',
        actor
      )
    );
    assert.deepEqual(repository.workspace(), snapshot);
  } finally {
    repository.close();
  }
});
