import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
  CrmWorkspace,
  Customer,
  Vehicle,
  RepairRequest,
  RepairOrder,
  OrderItem,
  WorkflowEvent
} from '../api/types';
import type {
  CustomerInput,
  VehicleInput,
  RequestInput,
  OrderInput,
  UpdateOrderInput,
  WorkflowInput
} from '../schemas/crm';
import { businessToday } from '../lib/workflow';
import { workflowSchema } from '../schemas/crm';

export class CrmError extends Error {}

// A single local database. Writes are short synchronous transactions; no network I/O
// occurs inside them. Instantiate separately in tests to verify persistence.
export class CrmRepository {
  private db: DatabaseSync;

  constructor(filename: string) {
    if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS crm_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS crm_customers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL,
        notes TEXT NOT NULL, createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS crm_vehicles (
        id TEXT PRIMARY KEY, customerId TEXT NOT NULL REFERENCES crm_customers(id),
        make TEXT NOT NULL, model TEXT NOT NULL, plate TEXT NOT NULL,
        vin TEXT UNIQUE CHECK(vin IS NULL OR length(vin) = 17)
      );
      CREATE TABLE IF NOT EXISTS crm_requests (
        id TEXT PRIMARY KEY, customerId TEXT NOT NULL REFERENCES crm_customers(id),
        vehicleId TEXT NOT NULL REFERENCES crm_vehicles(id), description TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('backlog','converted')), createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS crm_orders (
        number INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
        requestId TEXT UNIQUE REFERENCES crm_requests(id),
        customerId TEXT NOT NULL REFERENCES crm_customers(id),
        vehicleId TEXT NOT NULL REFERENCES crm_vehicles(id),
        description TEXT NOT NULL, createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS crm_order_items (
        orderId TEXT NOT NULL REFERENCES crm_orders(id), position INTEGER NOT NULL,
        description TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0),
        unitPriceCents INTEGER NOT NULL CHECK(unitPriceCents >= 0),
        PRIMARY KEY(orderId, position)
      );
      CREATE INDEX IF NOT EXISTS crm_vehicles_customer ON crm_vehicles(customerId);
    `);
    const version = this.db.prepare('PRAGMA user_version').get()?.user_version as number;
    if (version < 2)
      this.transaction(() => {
        this.db.exec(`
        ALTER TABLE crm_requests ADD COLUMN plannedIntakeDate TEXT;
        ALTER TABLE crm_requests ADD COLUMN plannedDeliveryDate TEXT;
        ALTER TABLE crm_orders ADD COLUMN status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','ready','delivered'));
        ALTER TABLE crm_orders ADD COLUMN plannedIntakeDate TEXT;
        ALTER TABLE crm_orders ADD COLUMN plannedDeliveryDate TEXT;
        ALTER TABLE crm_orders ADD COLUMN actualIntakeDate TEXT;
        ALTER TABLE crm_orders ADD COLUMN actualReadyDate TEXT;
        ALTER TABLE crm_orders ADD COLUMN actualDeliveryDate TEXT;
        CREATE TABLE crm_workflow_events (
          id TEXT PRIMARY KEY, kind TEXT NOT NULL, recordId TEXT NOT NULL,
          fromStatus TEXT, toStatus TEXT NOT NULL, previousIntakeDate TEXT,
          previousDeliveryDate TEXT, plannedIntakeDate TEXT, plannedDeliveryDate TEXT,
          note TEXT NOT NULL, createdAt TEXT NOT NULL
        );
        CREATE INDEX crm_events_record ON crm_workflow_events(kind, recordId, createdAt);
        PRAGMA user_version = 2;
      `);
      });
    const latestVersion = this.db.prepare('PRAGMA user_version').get()?.user_version as number;
    if (latestVersion < 3) {
      this.db.exec('PRAGMA foreign_keys = OFF');
      try {
        this.transaction(() => {
          this.db.exec(`
          CREATE TABLE crm_vehicles_new (
            id TEXT PRIMARY KEY, customerId TEXT REFERENCES crm_customers(id),
            make TEXT NOT NULL, model TEXT NOT NULL, plate TEXT NOT NULL,
            vin TEXT UNIQUE CHECK(vin IS NULL OR length(vin) = 17),
            year INTEGER CHECK(year IS NULL OR year BETWEEN 1900 AND 2200), createdAt TEXT NOT NULL
          );
          INSERT INTO crm_vehicles_new SELECT id, customerId, make, model, plate, vin, NULL, '' FROM crm_vehicles;
          DROP TABLE crm_vehicles;
          ALTER TABLE crm_vehicles_new RENAME TO crm_vehicles;
          CREATE INDEX crm_vehicles_customer ON crm_vehicles(customerId);
          PRAGMA user_version = 3;
        `);
          if (this.db.prepare('PRAGMA foreign_key_check').all().length)
            throw new CrmError('Помилка зв’язків під час міграції');
        });
      } finally {
        this.db.exec('PRAGMA foreign_keys = ON');
      }
    }
  }

  close(): void {
    this.db.close();
  }

  authorize(userId: string, configuredAdmin?: string): void {
    if (configuredAdmin && configuredAdmin !== userId)
      throw new CrmError('Доступ має лише адміністратор');
    // The first signed-in CRM visitor claims this single-admin installation.
    this.db
      .prepare("INSERT OR IGNORE INTO crm_settings (key, value) VALUES ('admin', ?)")
      .run(userId);
    const admin = this.db.prepare("SELECT value FROM crm_settings WHERE key = 'admin'").get();
    if (admin?.value !== userId) throw new CrmError('Доступ має лише адміністратор цієї CRM');
  }

  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private vehicleFor(customerId: string, vehicleId: string): Vehicle {
    const vehicle = this.db
      .prepare('SELECT * FROM crm_vehicles WHERE id = ? AND customerId = ?')
      .get(vehicleId, customerId) as unknown as Vehicle | undefined;
    if (!vehicle) throw new CrmError('Автомобіль не належить вибраному клієнту');
    return vehicle;
  }

  private writeItems(orderId: string, items: OrderInput['items']): void {
    const statement = this.db.prepare('INSERT INTO crm_order_items VALUES (?, ?, ?, ?, ?)');
    items.forEach((item, index) =>
      statement.run(
        orderId,
        index,
        item.description,
        item.quantity,
        Math.round(item.unitPrice * 100)
      )
    );
  }

  private logEvent(event: Omit<WorkflowEvent, 'id' | 'createdAt'>): void {
    this.db
      .prepare('INSERT INTO crm_workflow_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        randomUUID(),
        event.kind,
        event.recordId,
        event.fromStatus,
        event.toStatus,
        event.previousIntakeDate,
        event.previousDeliveryDate,
        event.plannedIntakeDate,
        event.plannedDeliveryDate,
        event.note,
        new Date().toISOString()
      );
  }

  private checkPlan(intake?: string | null, delivery?: string | null): void {
    if (intake && delivery && delivery < intake)
      throw new CrmError('Запланована видача не може бути раніше запланованого прийому');
  }

  workspace(): CrmWorkspace {
    const customers = this.db
      .prepare('SELECT * FROM crm_customers ORDER BY createdAt DESC, id')
      .all()
      .map((row) => ({ ...row })) as unknown as Customer[];
    const vehicles = this.db
      .prepare('SELECT * FROM crm_vehicles ORDER BY createdAt DESC, rowid DESC')
      .all()
      .map((row) => ({ ...row })) as unknown as Vehicle[];
    const requests = this.db
      .prepare(
        "SELECT *, CASE WHEN status = 'converted' THEN 'converted' WHEN plannedIntakeDate IS NOT NULL THEN 'scheduled' ELSE 'backlog' END AS status FROM crm_requests ORDER BY createdAt DESC, id"
      )
      .all()
      .map((row) => ({ ...row })) as unknown as RepairRequest[];
    const rows = this.db
      .prepare('SELECT * FROM crm_orders ORDER BY number DESC')
      .all() as unknown as Omit<RepairOrder, 'items' | 'totalCents'>[];
    const items = this.db
      .prepare('SELECT * FROM crm_order_items ORDER BY position')
      .all() as unknown as (OrderItem & { orderId: string })[];
    const byOrder = new Map<string, OrderItem[]>();
    for (const item of items) {
      const list = byOrder.get(item.orderId) ?? [];
      list.push({
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents
      });
      byOrder.set(item.orderId, list);
    }
    const orders = rows.map((row) => {
      const orderItems = byOrder.get(row.id) ?? [];
      return {
        ...row,
        items: orderItems,
        totalCents: orderItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)
      };
    });
    const events = this.db
      .prepare('SELECT * FROM crm_workflow_events ORDER BY createdAt DESC, rowid DESC')
      .all()
      .map((row) => ({ ...row })) as unknown as WorkflowEvent[];
    return { customers, vehicles, requests, orders, events };
  }

  createCustomer(input: CustomerInput): string {
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO crm_customers VALUES (?, ?, ?, ?, ?)')
      .run(id, input.name, input.phone, input.notes, new Date().toISOString());
    return id;
  }

  createVehicle(input: VehicleInput): string {
    if (
      input.customerId &&
      !this.db.prepare('SELECT id FROM crm_customers WHERE id = ?').get(input.customerId)
    )
      throw new CrmError('Клієнта не знайдено');
    const id = randomUUID();
    const vin = input.vin.trim().toUpperCase() || null;
    if (vin && this.db.prepare('SELECT id FROM crm_vehicles WHERE vin = ?').get(vin))
      throw new CrmError('Автомобіль із таким VIN уже існує');
    this.db
      .prepare('INSERT INTO crm_vehicles VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        id,
        input.customerId || null,
        input.make,
        input.model,
        input.plate,
        vin,
        input.year,
        new Date().toISOString()
      );
    return id;
  }

  updateVin(id: string, vin: string): void {
    if (!this.db.prepare('SELECT id FROM crm_vehicles WHERE id = ?').get(id))
      throw new CrmError('Автомобіль не знайдено');
    if (this.db.prepare('SELECT id FROM crm_vehicles WHERE vin = ? AND id != ?').get(vin, id))
      throw new CrmError('Автомобіль із таким VIN уже існує');
    const current = this.db.prepare('SELECT vin FROM crm_vehicles WHERE id = ?').get(id);
    if (
      current?.vin &&
      current.vin !== vin &&
      this.db
        .prepare(
          'SELECT id FROM crm_requests WHERE vehicleId = ? UNION ALL SELECT id FROM crm_orders WHERE vehicleId = ? LIMIT 1'
        )
        .get(id, id)
    )
      throw new CrmError('VIN авто з історією змінювати не можна');
    this.db.prepare('UPDATE crm_vehicles SET vin = ? WHERE id = ?').run(vin, id);
  }

  assignVehicle(id: string, customerId: string): void {
    const vehicle = this.db.prepare('SELECT customerId FROM crm_vehicles WHERE id = ?').get(id);
    if (!vehicle) throw new CrmError('Автомобіль не знайдено');
    if (vehicle.customerId && vehicle.customerId !== customerId)
      throw new CrmError('Авто вже закріплене за іншим клієнтом');
    if (!this.db.prepare('SELECT id FROM crm_customers WHERE id = ?').get(customerId))
      throw new CrmError('Клієнта не знайдено');
    this.db.prepare('UPDATE crm_vehicles SET customerId = ? WHERE id = ?').run(customerId, id);
  }

  updateVehicle(id: string, input: VehicleInput): void {
    this.transaction(() => {
      const current = this.db.prepare('SELECT * FROM crm_vehicles WHERE id = ?').get(id);
      if (!current) throw new CrmError('Автомобіль не знайдено');
      const linked = this.db
        .prepare(
          'SELECT id FROM crm_requests WHERE vehicleId = ? UNION ALL SELECT id FROM crm_orders WHERE vehicleId = ? LIMIT 1'
        )
        .get(id, id);
      const vin = input.vin.trim().toUpperCase() || null;
      if (
        linked &&
        ((current.vin && current.vin !== vin) || current.customerId !== (input.customerId || null))
      )
        throw new CrmError('Авто має історію: VIN та клієнта змінювати не можна');
      if (
        input.customerId &&
        !this.db.prepare('SELECT id FROM crm_customers WHERE id = ?').get(input.customerId)
      )
        throw new CrmError('Клієнта не знайдено');
      if (
        vin &&
        this.db.prepare('SELECT id FROM crm_vehicles WHERE vin = ? AND id != ?').get(vin, id)
      )
        throw new CrmError('Автомобіль із таким VIN уже існує');
      this.db
        .prepare(
          'UPDATE crm_vehicles SET customerId = ?, make = ?, model = ?, year = ?, plate = ?, vin = ? WHERE id = ?'
        )
        .run(input.customerId || null, input.make, input.model, input.year, input.plate, vin, id);
    });
  }

  deleteVehicle(id: string): void {
    this.transaction(() => {
      if (!this.db.prepare('SELECT id FROM crm_vehicles WHERE id = ?').get(id))
        throw new CrmError('Автомобіль не знайдено');
      if (
        this.db
          .prepare(
            'SELECT id FROM crm_requests WHERE vehicleId = ? UNION ALL SELECT id FROM crm_orders WHERE vehicleId = ? LIMIT 1'
          )
          .get(id, id)
      )
        throw new CrmError(
          'Авто має заявки або замовлення. Видалення недоступне, щоб зберегти історію.'
        );
      this.db.prepare('DELETE FROM crm_vehicles WHERE id = ?').run(id);
    });
  }

  createRequest(input: RequestInput): string {
    this.vehicleFor(input.customerId, input.vehicleId);
    this.checkPlan(input.plannedIntakeDate, input.plannedDeliveryDate);
    const id = randomUUID();
    this.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO crm_requests (id, customerId, vehicleId, description, status, createdAt, plannedIntakeDate, plannedDeliveryDate) VALUES (?, ?, ?, ?, 'backlog', ?, ?, ?)"
        )
        .run(
          id,
          input.customerId,
          input.vehicleId,
          input.description,
          new Date().toISOString(),
          input.plannedIntakeDate || null,
          input.plannedDeliveryDate || null
        );
      this.logEvent({
        kind: 'request',
        recordId: id,
        fromStatus: null,
        toStatus: input.plannedIntakeDate ? 'scheduled' : 'backlog',
        previousIntakeDate: null,
        previousDeliveryDate: null,
        plannedIntakeDate: input.plannedIntakeDate || null,
        plannedDeliveryDate: input.plannedDeliveryDate || null,
        note: ''
      });
    });
    return id;
  }

  createOrder(input: OrderInput): string {
    return this.transaction(() => {
      const vehicle = this.vehicleFor(input.customerId, input.vehicleId);
      if (!vehicle.vin) throw new CrmError('Додайте VIN автомобіля перед початком робіт');
      this.checkPlan(input.plannedIntakeDate, input.plannedDeliveryDate);
      const actualIntakeDate = input.actualIntakeDate || businessToday();
      if (actualIntakeDate > businessToday())
        throw new CrmError('Фактична дата прийому не може бути в майбутньому');
      let source: RepairRequest | undefined;
      if (input.requestId) {
        source = this.db
          .prepare(
            "SELECT * FROM crm_requests WHERE id = ? AND customerId = ? AND vehicleId = ? AND status = 'backlog'"
          )
          .get(input.requestId, input.customerId, input.vehicleId) as unknown as
          | RepairRequest
          | undefined;
        if (!source) throw new CrmError('Заявку вже взято в роботу або вона належить іншому авто');
      }
      const plannedIntakeDate = input.plannedIntakeDate ?? source?.plannedIntakeDate ?? '';
      const plannedDeliveryDate = input.plannedDeliveryDate ?? source?.plannedDeliveryDate ?? '';
      if (
        source &&
        ((source.plannedIntakeDate && source.plannedIntakeDate !== plannedIntakeDate) ||
          (source.plannedDeliveryDate && source.plannedDeliveryDate !== plannedDeliveryDate))
      )
        throw new CrmError(
          'Спочатку перенесіть дату заявки через «Статус і дати» та вкажіть причину'
        );
      this.checkPlan(plannedIntakeDate, plannedDeliveryDate);
      const id = randomUUID();
      this.db
        .prepare(
          'INSERT INTO crm_orders (id, requestId, customerId, vehicleId, description, createdAt, plannedIntakeDate, plannedDeliveryDate, actualIntakeDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          id,
          input.requestId || null,
          input.customerId,
          input.vehicleId,
          input.description,
          new Date().toISOString(),
          plannedIntakeDate || null,
          plannedDeliveryDate || null,
          actualIntakeDate
        );
      this.writeItems(id, input.items);
      if (input.requestId)
        this.db
          .prepare("UPDATE crm_requests SET status = 'converted' WHERE id = ?")
          .run(input.requestId);
      this.logEvent({
        kind: 'order',
        recordId: id,
        fromStatus: null,
        toStatus: 'in_progress',
        previousIntakeDate: null,
        previousDeliveryDate: null,
        plannedIntakeDate: plannedIntakeDate || null,
        plannedDeliveryDate: plannedDeliveryDate || null,
        note: ''
      });
      if (source)
        this.logEvent({
          kind: 'request',
          recordId: source.id,
          fromStatus: source.plannedIntakeDate ? 'scheduled' : 'backlog',
          toStatus: 'converted',
          previousIntakeDate: source.plannedIntakeDate,
          previousDeliveryDate: source.plannedDeliveryDate,
          plannedIntakeDate: source.plannedIntakeDate,
          plannedDeliveryDate: source.plannedDeliveryDate,
          note: ''
        });
      return id;
    });
  }

  updateOrder(input: UpdateOrderInput): void {
    this.transaction(() => {
      if (!this.db.prepare('SELECT id FROM crm_orders WHERE id = ?').get(input.id))
        throw new CrmError('Замовлення не знайдено');
      this.db
        .prepare('UPDATE crm_orders SET description = ? WHERE id = ?')
        .run(input.description, input.id);
      this.db.prepare('DELETE FROM crm_order_items WHERE orderId = ?').run(input.id);
      this.writeItems(input.id, input.items);
    });
  }

  updateWorkflow(input: WorkflowInput): void {
    const value = workflowSchema.parse(input);
    this.transaction(() => {
      const table = value.kind === 'request' ? 'crm_requests' : 'crm_orders';
      const current = this.db
        .prepare(`SELECT * FROM ${table} WHERE id = ?`)
        .get(value.id) as unknown as RepairRequest | RepairOrder | undefined;
      if (!current) throw new CrmError('Запис не знайдено');
      const currentStatus =
        value.kind === 'request' && current.status !== 'converted'
          ? current.plannedIntakeDate
            ? 'scheduled'
            : 'backlog'
          : current.status;
      if (currentStatus === 'converted')
        throw new CrmError('Заявку вже перетворено на замовлення. Оновіть дошку.');
      if (currentStatus !== value.expectedStatus)
        throw new CrmError('Статус уже змінено в іншому вікні. Оновіть дошку.');
      const rescheduled =
        (current.plannedIntakeDate &&
          current.plannedIntakeDate !== (value.plannedIntakeDate || null)) ||
        (current.plannedDeliveryDate &&
          current.plannedDeliveryDate !== (value.plannedDeliveryDate || null));
      if (rescheduled && !value.note)
        throw new CrmError('Вкажіть причину перенесення запланованих дат');
      const actualChanges: string[] = [];
      if (value.kind === 'order') {
        const currentOrder = current as RepairOrder;
        for (const [field, label] of [
          ['actualIntakeDate', 'Фактичний прийом'],
          ['actualReadyDate', 'Фактична готовність'],
          ['actualDeliveryDate', 'Фактична видача']
        ] as const) {
          if ((currentOrder[field] || '') !== value[field]) {
            if (currentOrder[field] && !value.note)
              throw new CrmError('Вкажіть причину зміни фактичної дати або повернення статусу');
            actualChanges.push(`${label}: ${currentOrder[field] || '—'} → ${value[field] || '—'}`);
          }
        }
      }
      if (value.kind === 'request')
        this.db
          .prepare(
            'UPDATE crm_requests SET plannedIntakeDate = ?, plannedDeliveryDate = ? WHERE id = ?'
          )
          .run(value.plannedIntakeDate || null, value.plannedDeliveryDate || null, value.id);
      else
        this.db
          .prepare(
            'UPDATE crm_orders SET status = ?, plannedIntakeDate = ?, plannedDeliveryDate = ?, actualIntakeDate = ?, actualReadyDate = ?, actualDeliveryDate = ? WHERE id = ?'
          )
          .run(
            value.status,
            value.plannedIntakeDate || null,
            value.plannedDeliveryDate || null,
            value.actualIntakeDate || null,
            value.actualReadyDate || null,
            value.actualDeliveryDate || null,
            value.id
          );
      this.logEvent({
        kind: value.kind,
        recordId: value.id,
        fromStatus: currentStatus,
        toStatus: value.status,
        previousIntakeDate: current.plannedIntakeDate,
        previousDeliveryDate: current.plannedDeliveryDate,
        plannedIntakeDate: value.plannedIntakeDate || null,
        plannedDeliveryDate: value.plannedDeliveryDate || null,
        note: [value.note, ...actualChanges].filter(Boolean).join('\n')
      });
    });
  }
}

const globalDb = globalThis as typeof globalThis & {
  crmRepository?: CrmRepository;
  crmSchemaVersion?: number;
};
export function getCrmRepository(): CrmRepository {
  if (
    globalDb.crmRepository &&
    (globalDb.crmSchemaVersion !== 3 || !(globalDb.crmRepository instanceof CrmRepository))
  ) {
    globalDb.crmRepository.close();
    globalDb.crmRepository = undefined;
  }
  globalDb.crmSchemaVersion = 3;
  return (globalDb.crmRepository ??= new CrmRepository(
    process.env.CRM_DATABASE_PATH || resolve('data/crm.sqlite')
  ));
}
