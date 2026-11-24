import test from 'node:test';
import assert from 'node:assert/strict';
import {
  phoneCountryInfo,
  phoneNumberError,
  formatCustomerPhone,
  formatPhoneInputEdit
} from '@/lib/phone-number';
import { customerSchema } from '../schemas/crm';
import { normalizeContact } from '../lib/customer-contacts';
import { CrmRepository } from '../server/repository';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

test('live phone formatting keeps only digits and a leading plus and follows each country format', () => {
  for (const [input, expected] of [
    ['+380501234567', '+380 50 123 4567'],
    ['0501234567', '050 123 4567'],
    ['+48600123456', '+48 600 123 456'],
    ['+14165550123', '+1 416 555 0123'],
    ['0048600123456', '00 48 600 123 456'],
    ['abc+380 (50) 123-45-67!', '+380 50 123 4567'],
    ['+380+++50', '+380 50'],
    ['+٣٨٠５０１２３４５６７', '+380 50 123 4567'],
    ['letters only', ''],
    ['+', '+'],
    ['', '']
  ]) {
    const edit = formatPhoneInputEdit(input, input.length);
    assert.equal(edit.value, expected, input);
    assert.equal(edit.caret, expected.length, input);
  }
});

test('live formatting preserves middle edits and deletes digits next to generated separators', () => {
  const previous = '050 123 4567';
  const inserted = formatPhoneInputEdit('050 1293 4567', 7, previous, 'insertText');
  assert.equal(inserted.value.replace(/\D/g, ''), '05012934567');
  assert.equal(inserted.value.slice(0, inserted.caret).replace(/\D/g, ''), '050129');
  const backward = formatPhoneInputEdit('050 1234567', 7, previous, 'deleteContentBackward');
  assert.equal(backward.value.replace(/\D/g, ''), '050124567');
  assert.equal(backward.value.slice(0, backward.caret).replace(/\D/g, ''), '05012');
  const forward = formatPhoneInputEdit('050 1234567', 7, previous, 'deleteContentForward');
  assert.equal(forward.value.replace(/\D/g, ''), '050123567');
  assert.equal(forward.value.slice(0, forward.caret).replace(/\D/g, ''), '050123');
  assert.equal(
    formatPhoneInputEdit('+380 50 123 456', 15, '+380 50 123 4567', 'deleteContentBackward').value,
    '+380 50 123 456'
  );
});

test('phone country detection works before a complete number and avoids guessing shared codes', () => {
  assert.equal(phoneCountryInfo('+380').country, 'UA');
  assert.equal(phoneCountryInfo('+48').country, 'PL');
  assert.equal(phoneCountryInfo('0049').country, 'DE');
  assert.equal(phoneCountryInfo('050').country, 'UA');
  assert.equal(phoneCountryInfo('+1').country, undefined);
  assert.match(phoneCountryInfo('+1').label, /Спільний код/);
  assert.equal(phoneCountryInfo('+1 416 555 0123').country, 'CA');
  assert.equal(phoneCountryInfo('+999').country, undefined);
  assert.equal(phoneCountryInfo('').country, undefined);
});

test('phone validation handles national UA and international mobile and fixed lines strictly', () => {
  for (const phone of [
    '0501234567',
    '380501234567',
    '+380 (67) 765-43-21',
    '+48 600 123 456',
    '00442079460018',
    '+1 416 555 0123'
  ])
    assert.equal(phoneNumberError(phone), undefined, phone);
  for (const phone of [
    '',
    '+380',
    '+999123456789',
    '+380000000000',
    '+48600',
    '+380501234567890',
    'call +380501234567',
    '+380501234567 ext 2',
    '+380+501234567',
    '1234567'
  ])
    assert.ok(phoneNumberError(phone), phone);
  assert.equal(formatCustomerPhone('0501234567'), '+380 50 123 4567');
  assert.equal(formatCustomerPhone('00442079460018'), '+44 20 7946 0018');
  assert.equal(formatCustomerPhone('+380'), '+380');
  assert.equal(
    normalizeContact('phone', '+44 (0)20 7946 0018'),
    normalizeContact('phone', '+442079460018')
  );
  assert.equal(
    customerSchema.safeParse({
      name: 'Клієнт',
      notes: '',
      contacts: [
        { type: 'phone', value: '+44 (0)20 7946 0018' },
        { type: 'phone', value: '+442079460018' }
      ]
    }).success,
    false
  );
});

test('server rejects invalid customer phones on create and update and retains previous contacts', () => {
  const repository = new CrmRepository(':memory:');
  try {
    assert.throws(() =>
      repository.createCustomer({ name: 'Некоректний', phone: '+380000000000', notes: '' })
    );
    const id = repository.createCustomer({ name: 'Клієнт', phone: '+48600123456', notes: '' });
    assert.throws(() =>
      repository.updateCustomer({
        id,
        expectedRevision: 0,
        name: 'Зміна',
        notes: '',
        contacts: [{ type: 'phone', value: '+380' }]
      })
    );
    const customer = repository.reads.list({ entity: 'customers' }).customers[0];
    assert.equal(customer.name, 'Клієнт');
    assert.equal(customer.phone, '+48600123456');
    assert.equal(customer.revision, 0);
  } finally {
    repository.close();
  }
});

test('reopening a database preserves a legacy international phone without adding a duplicate', () => {
  const directory = mkdtempSync(join(tmpdir(), 'crm-legacy-phone-'));
  const filename = join(directory, 'crm.sqlite');
  let repository = new CrmRepository(filename);
  try {
    repository.createCustomer({
      name: 'Міжнародний клієнт',
      phone: '+44 (0)20 7946 0018',
      notes: ''
    });
    const initial = repository.workspace().customers[0].contacts![0];
    repository.close();
    const database = new DatabaseSync(filename);
    database
      .prepare('UPDATE crm_customer_contacts SET normalizedValue=? WHERE id=?')
      .run('4402079460018', initial.id);
    database.close();
    repository = new CrmRepository(filename);
    const contacts = repository.workspace().customers[0].contacts!;
    assert.equal(contacts.length, 1);
    assert.equal(contacts[0].id, initial.id);
    assert.equal(contacts[0].value, initial.value);
  } finally {
    repository.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
