import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CrmRepository, OrganizationRepositories } from '../server/repository';

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
