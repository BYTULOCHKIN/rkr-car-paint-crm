import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { CrmRepository, OrganizationRepositories } from '../server/repository';
import { customerSchema } from '../schemas/crm';
import { contactSearchValues, normalizeContact } from '../lib/customer-contacts';

test('customer edits persist all contacts, preserve relations and reject stale or invalid updates atomically', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crm-contacts-'));
  const path = join(dir, 'crm.sqlite');
  let repository = new CrmRepository(path);
  try {
    const id = repository.createCustomer({ name: 'Микола', phone: '0501234567', notes: '' });
    const carId = repository.createVehicle({
      customerId: id,
      make: 'ZEEKR',
      model: '001',
      year: 2024,
      plate: '',
      vin: 'L6T79ZCEXRP120619'
    });
    const first = repository.workspace().customers[0];
    const originalContact = first.contacts![0].id;
    const contacts = [
      { type: 'phone' as const, value: '0501234567' },
      { type: 'phone' as const, value: '+380 67 765 43 21' },
      { type: 'email' as const, value: 'Mykola@example.com' }
    ];
    repository.updateCustomer({
      id,
      expectedRevision: 0,
      name: 'Микола Оновлений',
      contacts,
      notes: 'Нотатка'
    });
    let customer = repository.workspace().customers[0];
    assert.equal(customer.contacts!.length, 3);
    assert.equal(customer.contacts![0].id, originalContact);
    assert.equal(customer.revision, 1);
    assert.equal(customer.createdAt, first.createdAt);
    assert.equal(repository.workspace().vehicles.find((car) => car.id === carId)!.customerId, id);
    assert.ok(contactSearchValues(customer).includes('380677654321'));
    assert.throws(
      () =>
        repository.updateCustomer({
          id,
          expectedRevision: 0,
          name: 'Втрачена зміна',
          contacts,
          notes: ''
        }),
      /іншому вікні/
    );
    assert.throws(() =>
      repository.updateCustomer({
        id,
        expectedRevision: 1,
        name: 'Зіпсовано',
        contacts: [],
        notes: ''
      })
    );
    assert.equal(repository.workspace().customers[0].name, 'Микола Оновлений');
    repository.updateCustomer({
      id,
      expectedRevision: 1,
      name: 'Лише email',
      contacts: [{ type: 'email', value: 'only@example.com' }],
      notes: ''
    });
    repository.close();
    repository = new CrmRepository(path);
    customer = repository.workspace().customers[0];
    assert.equal(customer.phone, '');
    assert.deepEqual(
      customer.contacts!.map(({ type, value }) => ({ type, value })),
      [{ type: 'email', value: 'only@example.com' }]
    );
    assert.equal(customer.revision, 2);
  } finally {
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('contact validation rejects duplicate normalized phone/email and permits shared contacts across customers', () => {
  assert.equal(
    normalizeContact('phone', '050 123-45-67'),
    normalizeContact('phone', '+380 (50) 123-45-67')
  );
  for (const contacts of [
    [{ type: 'email', value: 'invalid' }],
    [{ type: 'phone', value: '--- 12' }],
    [
      { type: 'phone', value: '0501234567' },
      { type: 'phone', value: '+380 (50) 123-45-67' }
    ],
    [
      { type: 'email', value: ' Test@Example.com ' },
      { type: 'email', value: 'test@example.com' }
    ]
  ])
    assert.equal(customerSchema.safeParse({ name: 'Ім’я', notes: '', contacts }).success, false);
  const repository = new CrmRepository(':memory:');
  try {
    repository.createCustomer({
      name: 'Один',
      contacts: [{ type: 'email', value: 'shared@example.com' }],
      notes: ''
    });
    repository.createCustomer({
      name: 'Два',
      contacts: [{ type: 'email', value: 'shared@example.com' }],
      notes: ''
    });
    assert.equal(repository.workspace().customers.length, 2);
  } finally {
    repository.close();
  }
});

test('v11 migration moves existing phone into contacts and preserves data across reopen', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crm-contacts-migration-'));
  const path = join(dir, 'crm.sqlite');
  let repository = new CrmRepository(path);
  try {
    const id = repository.createCustomer({
      name: 'Збережений',
      phone: '+380501234567',
      notes: 'Нотатка'
    });
    repository.close();
    const old = new DatabaseSync(path);
    old.exec(
      'DROP TABLE crm_customer_contacts; ALTER TABLE crm_customers DROP COLUMN revision; PRAGMA user_version=11'
    );
    old.close();
    repository = new CrmRepository(path);
    const customer = repository.workspace().customers[0];
    assert.equal(customer.id, id);
    assert.equal(customer.notes, 'Нотатка');
    assert.equal(customer.contacts![0].value, '+380501234567');
    assert.equal(customer.revision, 0);
    repository.close();
    repository = new CrmRepository(path);
    assert.deepEqual(repository.workspace().customers[0], customer);
  } finally {
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('editing another shop customer is rejected without touching either shop', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crm-contacts-org-'));
  const registry = new OrganizationRepositories(join(dir, 'crm.sqlite'));
  try {
    const a = registry.forOrganization('org_A', 'admin_A', true);
    const b = registry.forOrganization('org_B', 'admin_B', true);
    const id = a.createCustomer({ name: 'Клієнт A', phone: '0501234567', notes: '' });
    assert.throws(
      () =>
        b.updateCustomer({
          id,
          expectedRevision: 0,
          name: 'Інше',
          contacts: [{ type: 'email', value: 'other@example.com' }],
          notes: ''
        }),
      /не знайдено/
    );
    assert.equal(a.workspace().customers[0].name, 'Клієнт A');
    assert.deepEqual(b.workspace().customers, []);
  } finally {
    registry.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
