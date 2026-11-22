import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { CrmRepository } from './repository';
import { businessToday } from '../lib/workflow';
import { bodyParts, paintModes } from '../constants/paint-plan';
import { FALLBACK_MODELS } from './vehicle-catalog';
import { orderSchema, requestSchema, vehicleSchema } from '../schemas/crm';
import type { HistoryActor } from '../api/types';

export interface DemoCounts {
  customers: number;
  vehicles: number;
  requests: number;
  orders: number;
}

export const defaultDemoCounts: DemoCounts = {
  customers: 300,
  vehicles: 500,
  requests: 200,
  orders: 1000
};

const tables = [
  'crm_customers',
  'crm_customer_contacts',
  'crm_vehicles',
  'crm_requests',
  'crm_orders',
  'crm_order_items',
  'crm_workflow_events',
  'crm_payments'
] as const;
const roots = ['crm_customers', 'crm_vehicles', 'crm_requests', 'crm_orders'] as const;

function dateOffset(days: number): string {
  const date = new Date(`${businessToday()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Generate in a disposable database using the same validation and writes as the app. */
export function generateDemoData(
  filename: string,
  assignees: HistoryActor[],
  counts: DemoCounts = defaultDemoCounts
): void {
  if (!assignees.length) throw new Error('Потрібен хоча б один чинний учасник');
  for (const count of Object.values(counts))
    if (!Number.isSafeInteger(count) || count < 1 || count > 100000)
      throw new Error('Кількості мають бути цілими числами від 1 до 100000');
  const repository = new CrmRepository(filename);
  const db = new DatabaseSync(filename);
  try {
    if (repository.hasBusinessData()) throw new Error('Генерація потребує порожньої бази');
    const actor = assignees[0];
    const names = ['Олександр', 'Олена', 'Андрій', 'Марія', 'Дмитро', 'Ірина', 'Сергій', 'Наталія'];
    const surnames = ['Коваленко', 'Бондаренко', 'Шевченко', 'Мельник', 'Ткаченко', 'Кравченко'];
    const customers = Array.from({ length: counts.customers }, (_, i) => {
      const id = repository.createCustomer({
        name: `[ТЕСТ] ${names[i % names.length]} ${surnames[Math.floor(i / names.length) % surnames.length]} ${i + 1}`,
        contacts: [{ type: 'email', value: `customer-${i + 1}@example.invalid` }],
        notes: 'Синтетичні дані для тестування. Контакти вигадані.'
      });
      db.prepare('UPDATE crm_customers SET createdAt=? WHERE id=?').run(
        `${dateOffset(-210)}T08:00:00Z`,
        id
      );
      return id;
    });
    const makes = Object.keys(FALLBACK_MODELS);
    const vehicles = Array.from({ length: counts.vehicles }, (_, i) => {
      const make = makes[i % makes.length];
      const models = FALLBACK_MODELS[make];
      const customerId = customers[i % customers.length];
      const id = repository.createVehicle(
        vehicleSchema.parse({
          customerId,
          make,
          model: models[Math.floor(i / makes.length) % models.length],
          year: new Date().getFullYear() - (i % 18),
          plate: `ТЕСТ ${String(i + 1).padStart(5, '0')}`,
          vin: `TEST${randomUUID().replaceAll('-', '').slice(0, 13).toUpperCase()}`
        })
      );
      db.prepare('UPDATE crm_vehicles SET createdAt=? WHERE id=?').run(
        `${dateOffset(-200)}T08:00:00Z`,
        id
      );
      return { id, customerId };
    });
    for (let i = 0; i < counts.requests; i++) {
      const vehicle = vehicles[i % vehicles.length];
      const plannedIntakeDate = i % 2 ? dateOffset((i % 35) - 7) : '';
      const id = repository.createRequest(
        requestSchema.parse({
          customerId: vehicle.customerId,
          vehicleId: vehicle.id,
          description: `[ТЕСТ] Оцінка ремонту та фарбування — заявка ${i + 1}`,
          plannedIntakeDate,
          plannedDeliveryDate: plannedIntakeDate ? dateOffset((i % 35) - 1) : ''
        }),
        actor
      );
      const createdAt = `${dateOffset(-40 + (i % 30))}T09:00:00Z`;
      db.prepare('UPDATE crm_requests SET createdAt=? WHERE id=?').run(createdAt, id);
      db.prepare('UPDATE crm_workflow_events SET createdAt=? WHERE recordId=?').run(createdAt, id);
    }
    for (let i = 0; i < counts.orders; i++) {
      const vehicle = vehicles[i % vehicles.length];
      // Mostly completed history, with smaller queues of current work.
      const status = (
        [
          'created',
          'in_progress',
          'ready',
          'delivered',
          'delivered',
          'delivered',
          'delivered',
          'delivered',
          'delivered',
          'delivered'
        ] as const
      )[i % 10];
      const age = status === 'delivered' ? 8 + ((i * 37) % 170) : 4 + (i % 14);
      const intake = dateOffset(-age);
      const plannedIntakeDate = status === 'created' ? dateOffset((i % 21) - 7) : intake;
      const plannedDeliveryDate =
        status === 'created' ? dateOffset((i % 21) - 1) : dateOffset(-age + 6);
      const items = [
        {
          description: 'Підготовка поверхні',
          quantity: 1 + (i % 3),
          unitPrice: 1200 + (i % 7) * 150
        },
        {
          description: 'Фарбування деталі',
          quantity: 1 + (i % 3),
          unitPrice: 2800 + (i % 9) * 200
        },
        { description: 'Полірування', quantity: 1, unitPrice: 650 + (i % 4) * 100 }
      ];
      const assignee = assignees[i % assignees.length];
      const id = repository.createOrder(
        orderSchema.parse({
          customerId: vehicle.customerId,
          vehicleId: vehicle.id,
          requestId: '',
          assigneeId: assignee.id,
          description: `[ТЕСТ] Кузовний ремонт і фарбування — ${i + 1}`,
          plannedIntakeDate,
          plannedDeliveryDate,
          items,
          paintPlan: [0, 1, 2].slice(0, 1 + (i % 3)).map((offset) => ({
            partId: bodyParts[(i + offset) % bodyParts.length].id,
            mode: paintModes[(i + offset) % paintModes.length].value
          }))
        }),
        assignee.name,
        actor
      );
      const createdAt = `${dateOffset(-age - 2)}T09:00:00Z`;
      db.prepare('UPDATE crm_orders SET createdAt=? WHERE id=?').run(createdAt, id);
      db.prepare('UPDATE crm_workflow_events SET createdAt=? WHERE recordId=?').run(createdAt, id);
      const stages = ['in_progress', 'ready', 'delivered'] as const;
      const stageCount = status === 'created' ? 0 : stages.indexOf(status) + 1;
      for (let stage = 0; stage < stageCount; stage++) {
        repository.updateWorkflow(
          {
            kind: 'order',
            id,
            expectedStatus: stage === 0 ? 'created' : stages[stage - 1],
            expectedRevision: stage,
            status: stages[stage],
            plannedIntakeDate,
            plannedDeliveryDate,
            actualIntakeDate: intake,
            actualReadyDate: stage >= 1 ? dateOffset(-age + 2) : '',
            actualDeliveryDate: stage >= 2 ? dateOffset(-age + 3) : '',
            note: '[ТЕСТ] Плановий етап ремонту'
          },
          actor
        );
        db.prepare(
          'UPDATE crm_workflow_events SET createdAt=? WHERE recordId=? AND toStatus=?'
        ).run(`${dateOffset(-age + [0, 2, 3][stage])}T12:00:00Z`, id, stages[stage]);
      }
      const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const fraction = [0, 0.3, 0.5, 1][i % 4];
      if (fraction) {
        const paymentId = repository.payments.receive(
          {
            operationId: randomUUID(),
            orderId: id,
            amount: (total * fraction).toFixed(2),
            note: '[ТЕСТ] Оплата за ремонт'
          },
          actor
        );
        db.prepare('UPDATE crm_payments SET createdAt=? WHERE id=?').run(
          `${status === 'delivered' ? dateOffset(-age + 3) : dateOffset(-age)}T14:00:00Z`,
          paymentId
        );
      }
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Порушено зв’язки');
  } finally {
    db.close();
    repository.close();
  }
}

function assertOrganization(db: DatabaseSync, orgId: string): void {
  if (db.prepare("SELECT value FROM crm_settings WHERE key='organization'").get()?.value !== orgId)
    throw new Error('База не належить вибраній організації');
}

function trackingTables(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS crm_demo_runs (
    id TEXT PRIMARY KEY, organizationId TEXT NOT NULL, createdAt TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS crm_demo_records (
    runId TEXT NOT NULL REFERENCES crm_demo_runs(id), tableName TEXT NOT NULL, recordId TEXT NOT NULL,
    PRIMARY KEY(runId, tableName, recordId)
  );`);
}

/** Import only generated business rows; preserve settings, catalog and order numbering. */
export function importDemoData(target: string, staged: string, orgId: string, runId: string): void {
  const db = new DatabaseSync(target);
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
    assertOrganization(db, orgId);
    db.prepare('ATTACH DATABASE ? AS demo').run(staged);
    db.exec('BEGIN IMMEDIATE');
    try {
      trackingTables(db);
      if (db.prepare('SELECT id FROM crm_demo_runs WHERE id=?').get(runId))
        throw new Error('Цей набір уже завантажено');
      db.prepare('INSERT INTO crm_demo_runs VALUES (?,?,?)').run(
        runId,
        orgId,
        new Date().toISOString()
      );
      for (const table of tables) {
        const columns = db
          .prepare(`PRAGMA main.table_info(${table})`)
          .all()
          .map((column) => String(column.name))
          .filter((column) => !(table === 'crm_orders' && column === 'number'))
          .map((column) => `"${column}"`)
          .join(',');
        db.exec(`INSERT INTO main.${table} (${columns}) SELECT ${columns} FROM demo.${table}`);
      }
      for (const table of roots)
        db.prepare(`INSERT INTO crm_demo_records SELECT ?, ?, id FROM demo.${table}`).run(
          runId,
          table
        );
      if (db.prepare('PRAGMA main.foreign_key_check').all().length)
        throw new Error('Порушено зв’язки');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    db.close();
  }
}

function demoIds(table: (typeof roots)[number]): string {
  return `SELECT recordId FROM crm_demo_records WHERE runId=? AND tableName='${table}'`;
}

/** Only rows belonging to the named demo run and their dependent records are removed. */
export function removeDemoData(target: string, orgId: string, runId: string): void {
  const db = new DatabaseSync(target);
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
    assertOrganization(db, orgId);
    db.exec('BEGIN IMMEDIATE');
    try {
      trackingTables(db);
      if (
        !db
          .prepare('SELECT id FROM crm_demo_runs WHERE id=? AND organizationId=?')
          .get(runId, orgId)
      )
        throw new Error('Тестовий набір не знайдено');
      db.prepare(
        `DELETE FROM crm_workflow_events WHERE recordId IN (${demoIds('crm_orders')}) OR recordId IN (${demoIds('crm_requests')})`
      ).run(runId, runId);
      for (const table of [
        'crm_customer_refunds',
        'crm_settlement_events',
        'crm_economics_postings',
        'crm_payments'
      ])
        db.prepare(`DELETE FROM ${table} WHERE orderId IN (${demoIds('crm_orders')})`).run(runId);
      db.prepare(`DELETE FROM crm_order_items WHERE orderId IN (${demoIds('crm_orders')})`).run(
        runId
      );
      for (const table of roots.toReversed())
        db.prepare(`DELETE FROM ${table} WHERE id IN (${demoIds(table)})`).run(runId);
      db.prepare('DELETE FROM crm_demo_records WHERE runId=?').run(runId);
      db.prepare('DELETE FROM crm_demo_runs WHERE id=?').run(runId);
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Порушено зв’язки');
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  } finally {
    db.close();
  }
}
