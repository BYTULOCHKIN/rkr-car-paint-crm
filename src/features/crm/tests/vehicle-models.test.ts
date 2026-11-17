import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OrganizationRepositories } from '../server/repository';
import { vehicleModelSchema } from '../schemas/vehicle-model';

test('custom models persist per organization and deduplicate without losing leading zeroes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crm-models-'));
  const filename = join(dir, 'crm.sqlite');
  let registry = new OrganizationRepositories(filename);
  try {
    const a = registry.forOrganization('org_A', 'admin_A', true);
    assert.equal(a.addVehicleModel({ make: ' zeekr ', model: ' 001 ' }), '001');
    assert.equal(a.addVehicleModel({ make: 'ZEEKR', model: '001' }), '001');
    a.addVehicleModel({ make: 'ford', model: ' Custom   Model ' });
    assert.equal(a.addVehicleModel({ make: 'FORD', model: 'custom model' }), 'Custom Model');
    assert.equal(a.vehicleModels().length, 2);
    assert.equal(a.hasBusinessData(), true);
    assert.deepEqual(registry.forOrganization('org_B', 'admin_B', true).vehicleModels(), []);
    registry.close();
    registry = new OrganizationRepositories(filename);
    assert.deepEqual(registry.forOrganization('org_A', 'admin_A', true).vehicleModels(), [
      { make: 'FORD', model: 'Custom Model' },
      { make: 'ZEEKR', model: '001' }
    ]);
    assert.deepEqual(registry.forOrganization('org_B', 'admin_B', true).vehicleModels(), []);
  } finally {
    registry.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('model validation rejects blank and oversized names', () => {
  for (const input of [
    { make: '', model: '001' },
    { make: 'ZEEKR', model: '  ' },
    { make: 'ZEEKR', model: 'a'.repeat(81) }
  ])
    assert.equal(vehicleModelSchema.safeParse(input).success, false);
});
