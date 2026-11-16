import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CrmRepository } from '../server/repository';
import { orderSchema, paintPlanSchema } from '../schemas/crm';
import type { PaintSelection } from '../constants/paint-plan';

const plan: PaintSelection[] = [
  { partId: 'hood', mode: 'both_sides' },
  { partId: 'left_front_door', mode: 'one_side' },
  { partId: 'rear_bumper', mode: 'partial' }
];
function create(repository: CrmRepository) {
  const customerId = repository.createCustomer({ name: 'Клієнт', phone: '0501234567', notes: '' });
  const vehicleId = repository.createVehicle({
    customerId,
    make: 'Ford',
    model: 'Focus',
    year: 2020,
    plate: 'AA1234AA',
    vin: 'WVWZZZ1JZXW000001'
  });
  return repository.createOrder(
    orderSchema.parse({
      customerId,
      vehicleId,
      requestId: '',
      description: 'Фарбування',
      paintPlan: plan,
      items: [{ description: 'Роботи за домовленістю', quantity: 2, unitPrice: 1234.56 }]
    })
  );
}

test('paint plan survives reopening, updates independently of prices and can be cleared', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crm-paint-'));
  const path = join(dir, 'crm.sqlite');
  let repository = new CrmRepository(path);
  try {
    const id = create(repository);
    repository.close();
    repository = new CrmRepository(path);
    const order = repository.workspace().orders[0];
    assert.deepEqual(order.paintPlan, plan);
    assert.equal(order.totalCents, 246912);
    const input = {
      id,
      description: order.description,
      items: order.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPriceCents / 100
      }))
    };
    repository.updateOrder(input);
    assert.deepEqual(
      repository.workspace().orders[0].paintPlan,
      plan,
      'legacy updates keep the saved plan'
    );
    repository.updateOrder({ ...input, paintPlan: [] });
    assert.deepEqual(repository.workspace().orders[0].paintPlan, []);
    assert.equal(repository.workspace().orders[0].totalCents, order.totalCents);
  } finally {
    repository.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migration from v3 preserves old orders and gives them an empty plan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crm-paint-migration-'));
  const path = join(dir, 'crm.sqlite');
  const initial = new CrmRepository(path);
  const id = create(initial);
  initial.close();
  const old = new DatabaseSync(path);
  old.exec('ALTER TABLE crm_orders DROP COLUMN paintPlan; PRAGMA user_version = 3;');
  old.close();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const migrated = new CrmRepository(path);
      try {
        const order = migrated.workspace().orders[0];
        assert.equal(order.id, id);
        assert.equal(order.totalCents, 246912);
        assert.deepEqual(order.paintPlan, []);
      } finally {
        migrated.close();
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unknown body parts, unknown paint modes and duplicate parts are rejected', () => {
  assert.equal(paintPlanSchema.safeParse(plan).success, true);
  assert.equal(paintPlanSchema.safeParse([{ partId: 'unknown', mode: 'one_side' }]).success, false);
  assert.equal(paintPlanSchema.safeParse([{ partId: 'hood', mode: 'other' }]).success, false);
  assert.equal(paintPlanSchema.safeParse([plan[0], plan[0]]).success, false);
});
