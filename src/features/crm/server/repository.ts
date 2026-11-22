import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type {
  CrmWorkspace,
  Customer,
  Vehicle,
  RepairRequest,
  RepairOrder,
  OrderItem,
  WorkflowEvent,
  ActualDateChange,
  OrderSnapshot,
  HistoryActor
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
import { paintPlanSchema, workflowSchema } from '../schemas/crm';
import { InventoryRepository, inventoryTables } from '@/features/inventory/server/repository';
import { migrateStockValuation } from '@/features/inventory/server/valuation-migration';
import { migrateCustomerContacts, replaceCustomerContacts } from './customer-contacts';
import { customerSchema, updateCustomerSchema, type UpdateCustomerInput } from '../schemas/crm';
import type { CustomerContact } from '../api/types';
import { PaymentRepository, migrateCreatedStatus } from './payments';
import { vehicleModelSchema, type VehicleModelInput } from '../schemas/vehicle-model';

export class CrmError extends Error {}

function normalizedOrderSnapshot(value: OrderSnapshot): string {
  return JSON.stringify({
    ...value,
    paintPlan: value.paintPlan.toSorted((a, b) => a.partId.localeCompare(b.partId))
  });
}

// A single local database. Writes are short synchronous transactions; no network I/O
// occurs inside them. Instantiate separately in tests to verify persistence.
export class CrmRepository {
  private db: DatabaseSync;
  readonly inventory: InventoryRepository;
  readonly payments: PaymentRepository;

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
    if ((this.db.prepare('PRAGMA user_version').get()?.user_version as number) < 4) {
      this.transaction(() =>
        this.db.exec(`
        ALTER TABLE crm_orders ADD COLUMN paintPlan TEXT NOT NULL DEFAULT '[]';
        PRAGMA user_version = 4;
      `)
      );
    }
    if ((this.db.prepare('PRAGMA user_version').get()?.user_version as number) < 5) {
      this.transaction(() =>
        this.db.exec(`
        ALTER TABLE crm_workflow_events ADD COLUMN actualDateChanges TEXT;
        ALTER TABLE crm_requests ADD COLUMN workflowRevision INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE crm_orders ADD COLUMN workflowRevision INTEGER NOT NULL DEFAULT 0;
        PRAGMA user_version = 5;
      `)
      );
    }
    if ((this.db.prepare('PRAGMA user_version').get()?.user_version as number) < 6) {
      this.transaction(() =>
        this.db.exec(`
        ALTER TABLE crm_workflow_events ADD COLUMN orderChanges TEXT;
        PRAGMA user_version = 6;
      `)
      );
    }
    if ((this.db.prepare('PRAGMA user_version').get()?.user_version as number) < 7) {
      this.transaction(() =>
        this.db.exec(`
        ALTER TABLE crm_orders ADD COLUMN assigneeId TEXT;
        ALTER TABLE crm_orders ADD COLUMN assigneeName TEXT;
        PRAGMA user_version = 7;
      `)
      );
    }
    if ((this.db.prepare('PRAGMA user_version').get()?.user_version as number) < 8) {
      this.transaction(() =>
        this.db.exec(
          `ALTER TABLE crm_workflow_events ADD COLUMN actor TEXT; PRAGMA user_version = 8;`
        )
      );
    }
    if ((this.db.prepare('PRAGMA user_version').get()?.user_version as number) < 9) {
      this.transaction(() => this.db.exec(`${inventoryTables} PRAGMA user_version = 9;`));
    }
    if ((this.db.prepare('PRAGMA user_version').get()?.user_version as number) < 10) {
      this.transaction(() =>
        this.db.exec(`
        CREATE TABLE crm_vehicle_models (
          make TEXT NOT NULL, model TEXT NOT NULL, modelKey TEXT NOT NULL,
          PRIMARY KEY(make, modelKey)
        );
        PRAGMA user_version = 10;
      `)
      );
    }
    if ((this.db.prepare('PRAGMA user_version').get()?.user_version as number) < 11)
      migrateCreatedStatus(this.db);
    if ((this.db.prepare('PRAGMA user_version').get()?.user_version as number) < 12)
      this.transaction(() => {
        migrateCustomerContacts(this.db);
        this.db.exec('PRAGMA user_version=12');
      });
    if ((this.db.prepare('PRAGMA user_version').get()?.user_version as number) < 13)
      this.transaction(() => {
        migrateStockValuation(this.db);
        this.db.exec('PRAGMA user_version=13');
      });
    this.payments = new PaymentRepository(this.db);
    this.inventory = new InventoryRepository(this.db);
  }

  vehicleModels(): { make: string; model: string }[] {
    return this.db
      .prepare('SELECT make, model FROM crm_vehicle_models ORDER BY make, model')
      .all()
      .map((row) => ({ make: row.make as string, model: row.model as string }));
  }

  addVehicleModel(input: VehicleModelInput): string {
    const { make, model } = vehicleModelSchema.parse(input);
    const key = model.toUpperCase();
    return this.transaction(() => {
      this.db
        .prepare('INSERT OR IGNORE INTO crm_vehicle_models(make, model, modelKey) VALUES (?, ?, ?)')
        .run(make, model, key);
      return this.db
        .prepare('SELECT model FROM crm_vehicle_models WHERE make = ? AND modelKey = ?')
        .get(make, key)!.model as string;
    });
  }

  /** The legacy installation can only be claimed by its existing owner. */
  claimOrganization(orgId: string, userId: string, configuredAdmin?: string): boolean {
    return this.transaction(() => {
      const bound = this.db
        .prepare("SELECT value FROM crm_settings WHERE key = 'organization'")
        .get()?.value;
      if (bound) return bound === orgId;
      const owner = this.db
        .prepare("SELECT value FROM crm_settings WHERE key = 'admin'")
        .get()?.value;
      if (owner !== userId && !(configuredAdmin === userId && !owner)) return false;
      if (configuredAdmin && configuredAdmin !== userId) return false;
      this.db
        .prepare("INSERT INTO crm_settings (key, value) VALUES ('organization', ?)")
        .run(orgId);
      return true;
    });
  }

  bindOrganization(orgId: string): void {
    this.transaction(() => {
      this.db
        .prepare("INSERT OR IGNORE INTO crm_settings (key, value) VALUES ('organization', ?)")
        .run(orgId);
      if (
        this.db.prepare("SELECT value FROM crm_settings WHERE key = 'organization'").get()
          ?.value !== orgId
      )
        throw new CrmError('База належить іншій автомалярці');
    });
  }

  hasBusinessData(): boolean {
    return !!this.db
      .prepare(
        'SELECT 1 AS present FROM crm_customers UNION ALL SELECT 1 FROM crm_vehicles UNION ALL SELECT 1 FROM crm_requests UNION ALL SELECT 1 FROM crm_orders UNION ALL SELECT 1 FROM stock_items UNION ALL SELECT 1 FROM crm_vehicle_models LIMIT 1'
      )
      .get();
  }

  organizationId(): string | null {
    return (
      (this.db.prepare("SELECT value FROM crm_settings WHERE key = 'organization'").get()
        ?.value as string) ?? null
    );
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

  private writePaintPlan(orderId: string, plan: OrderInput['paintPlan']): void {
    this.db
      .prepare('UPDATE crm_orders SET paintPlan = ? WHERE id = ?')
      .run(JSON.stringify(paintPlanSchema.parse(plan ?? [])), orderId);
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
      .prepare(
        'INSERT INTO crm_workflow_events (id, kind, recordId, fromStatus, toStatus, previousIntakeDate, previousDeliveryDate, plannedIntakeDate, plannedDeliveryDate, note, createdAt, actualDateChanges, orderChanges, actor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
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
        new Date().toISOString(),
        JSON.stringify(event.actualDateChanges ?? []),
        event.orderChanges ? JSON.stringify(event.orderChanges) : null,
        event.actor ? JSON.stringify(event.actor) : null
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
    const contacts = this.db
      .prepare(
        'SELECT id, customerId, type, value FROM crm_customer_contacts ORDER BY position, id'
      )
      .all();
    const byCustomer = new Map<string, CustomerContact[]>();
    for (const row of contacts) {
      const list = byCustomer.get(row.customerId as string) ?? [];
      list.push({
        id: row.id as string,
        type: row.type as CustomerContact['type'],
        value: row.value as string
      });
      byCustomer.set(row.customerId as string, list);
    }
    for (const customer of customers) {
      customer.contacts = byCustomer.get(customer.id) ?? [];
      customer.phone = customer.contacts.find((contact) => contact.type === 'phone')?.value ?? '';
    }
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
      .all() as unknown as (Omit<RepairOrder, 'items' | 'totalCents' | 'paintPlan'> & {
      paintPlan: string;
    })[];
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
        paintPlan: paintPlanSchema.parse(JSON.parse(row.paintPlan)),
        totalCents: orderItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)
      };
    });
    const events = this.db
      .prepare('SELECT * FROM crm_workflow_events ORDER BY createdAt DESC, rowid DESC')
      .all()
      .map((row) => ({
        ...row,
        actor: typeof row.actor === 'string' ? JSON.parse(row.actor) : null,
        orderChanges: typeof row.orderChanges === 'string' ? JSON.parse(row.orderChanges) : null,
        actualDateChanges:
          typeof row.actualDateChanges === 'string' ? JSON.parse(row.actualDateChanges) : null
      })) as unknown as WorkflowEvent[];
    return { customers, vehicles, requests, orders, events, payments: this.payments.list() };
  }

  createCustomer(input: CustomerInput): string {
    const value = customerSchema.parse(input);
    const contacts = value.contacts ?? [{ type: 'phone' as const, value: value.phone! }];
    const id = randomUUID();
    return this.transaction(() => {
      this.db
        .prepare(
          'INSERT INTO crm_customers (id, name, phone, notes, createdAt) VALUES (?, ?, ?, ?, ?)'
        )
        .run(
          id,
          value.name,
          contacts.find((contact) => contact.type === 'phone')?.value ?? '',
          value.notes,
          new Date().toISOString()
        );
      replaceCustomerContacts(this.db, id, contacts);
      return id;
    });
  }

  updateCustomer(input: UpdateCustomerInput): void {
    const value = updateCustomerSchema.parse(input);
    const contacts = value.contacts ?? [{ type: 'phone' as const, value: value.phone! }];
    this.transaction(() => {
      const current = this.db
        .prepare('SELECT revision FROM crm_customers WHERE id=?')
        .get(value.id);
      if (!current) throw new CrmError('Клієнта не знайдено');
      if (current.revision !== value.expectedRevision)
        throw new CrmError('Клієнта вже змінено в іншому вікні. Відкрийте картку повторно.');
      this.db
        .prepare(
          'UPDATE crm_customers SET name=?, phone=?, notes=?, revision=revision+1 WHERE id=?'
        )
        .run(
          value.name,
          contacts.find((contact) => contact.type === 'phone')?.value ?? '',
          value.notes,
          value.id
        );
      replaceCustomerContacts(this.db, value.id, contacts);
    });
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

  createRequest(input: RequestInput, actor?: HistoryActor): string {
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
        actor,
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

  createOrder(input: OrderInput, assigneeName?: string, actor?: HistoryActor): string {
    return this.transaction(() => {
      const vehicle = this.vehicleFor(input.customerId, input.vehicleId);
      if (!vehicle.vin) throw new CrmError('Додайте VIN автомобіля перед початком робіт');
      this.checkPlan(input.plannedIntakeDate, input.plannedDeliveryDate);
      const actualIntakeDate = input.actualIntakeDate || null;
      if (actualIntakeDate && actualIntakeDate > businessToday())
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
        ((source.plannedIntakeDate || '') !== plannedIntakeDate ||
          (source.plannedDeliveryDate || '') !== plannedDeliveryDate)
      )
        throw new CrmError(
          'Спочатку перенесіть дату заявки через «Статус і дати» та вкажіть причину'
        );
      this.checkPlan(plannedIntakeDate, plannedDeliveryDate);
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO crm_orders (id, requestId, customerId, vehicleId, description, createdAt, plannedIntakeDate, plannedDeliveryDate, actualIntakeDate, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'created')"
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
      this.db
        .prepare('UPDATE crm_orders SET assigneeId = ?, assigneeName = ? WHERE id = ?')
        .run(input.assigneeId || null, assigneeName || null, id);
      this.writeItems(id, input.items);
      this.writePaintPlan(id, input.paintPlan);
      if (input.requestId)
        this.db
          .prepare("UPDATE crm_requests SET status = 'converted' WHERE id = ?")
          .run(input.requestId);
      this.logEvent({
        actor,
        kind: 'order',
        recordId: id,
        fromStatus: null,
        toStatus: 'created',
        actualDateChanges: actualIntakeDate
          ? [{ field: 'actualIntakeDate', before: null, after: actualIntakeDate }]
          : [],
        previousIntakeDate: null,
        previousDeliveryDate: null,
        plannedIntakeDate: plannedIntakeDate || null,
        plannedDeliveryDate: plannedDeliveryDate || null,
        note: ''
      });
      if (source)
        this.logEvent({
          actor,
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

  updateOrder(input: UpdateOrderInput, assigneeName?: string, actor?: HistoryActor): void {
    this.transaction(() => {
      const current = this.db
        .prepare('SELECT * FROM crm_orders WHERE id = ?')
        .get(input.id) as unknown as
        | (Omit<RepairOrder, 'paintPlan'> & { paintPlan: string })
        | undefined;
      if (!current) throw new CrmError('Замовлення не знайдено');
      if (
        input.expectedRevision !== undefined &&
        input.expectedRevision !== current.workflowRevision
      )
        throw new CrmError(
          'Замовлення вже змінено в іншому вікні. Відкрийте його повторно перед редагуванням.'
        );
      const items = this.db
        .prepare(
          'SELECT description, quantity, unitPriceCents FROM crm_order_items WHERE orderId = ? ORDER BY position'
        )
        .all(input.id)
        .map((row) => ({ ...row })) as unknown as OrderItem[];
      const paid = this.payments
        .list()
        .filter((entry) => entry.orderId === input.id)
        .reduce(
          (sum, entry) => sum + (entry.kind === 'payment' ? entry.amountCents : -entry.amountCents),
          0
        );
      const newTotal = input.items.reduce(
        (sum, item) => sum + item.quantity * Math.round(item.unitPrice * 100),
        0
      );
      if (newTotal < paid)
        throw new CrmError(
          'Вартість не може бути меншою за отриману оплату. Спочатку скасуйте помилковий платіж.'
        );
      const before: OrderSnapshot = {
        assigneeId: current.assigneeId ?? null,
        assigneeName: current.assigneeName ?? null,
        description: current.description,
        items,
        paintPlan: paintPlanSchema.parse(JSON.parse(current.paintPlan)),
        totalCents: items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)
      };
      const afterItems = input.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: Math.round(item.unitPrice * 100)
      }));
      const after: OrderSnapshot = {
        assigneeId: input.assigneeId ?? before.assigneeId,
        assigneeName:
          input.assigneeId === undefined
            ? before.assigneeName
            : (assigneeName ?? before.assigneeName),
        description: input.description,
        items: afterItems,
        paintPlan:
          input.paintPlan === undefined ? before.paintPlan : paintPlanSchema.parse(input.paintPlan),
        totalCents: afterItems.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)
      };
      if (normalizedOrderSnapshot(before) === normalizedOrderSnapshot(after)) return;
      this.db
        .prepare(
          'UPDATE crm_orders SET description = ?, workflowRevision = workflowRevision + 1 WHERE id = ?'
        )
        .run(input.description, input.id);
      if (input.assigneeId !== undefined)
        this.db
          .prepare('UPDATE crm_orders SET assigneeId = ?, assigneeName = ? WHERE id = ?')
          .run(input.assigneeId, assigneeName ?? null, input.id);
      this.db.prepare('DELETE FROM crm_order_items WHERE orderId = ?').run(input.id);
      this.writeItems(input.id, input.items);
      if (input.paintPlan !== undefined) this.writePaintPlan(input.id, input.paintPlan);
      this.logEvent({
        actor,
        kind: 'order',
        recordId: input.id,
        fromStatus: current.status,
        toStatus: current.status,
        previousIntakeDate: current.plannedIntakeDate,
        previousDeliveryDate: current.plannedDeliveryDate,
        plannedIntakeDate: current.plannedIntakeDate,
        plannedDeliveryDate: current.plannedDeliveryDate,
        note: '',
        orderChanges: { before, after }
      });
    });
  }

  updateWorkflow(input: WorkflowInput, actor?: HistoryActor): void {
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
      if ((value.expectedRevision ?? 0) !== (current.workflowRevision ?? 0))
        throw new CrmError('Запис уже змінено в іншому вікні. Оновіть дані та повторіть зміни.');
      const rescheduled =
        (current.plannedIntakeDate &&
          current.plannedIntakeDate !== (value.plannedIntakeDate || null)) ||
        (current.plannedDeliveryDate &&
          current.plannedDeliveryDate !== (value.plannedDeliveryDate || null));
      if (rescheduled && !value.note)
        throw new CrmError('Вкажіть причину перенесення запланованих дат');
      const actualChanges: ActualDateChange[] = [];
      if (value.kind === 'order') {
        const currentOrder = current as RepairOrder;
        for (const field of [
          'actualIntakeDate',
          'actualReadyDate',
          'actualDeliveryDate'
        ] as const) {
          if ((currentOrder[field] || '') !== value[field]) {
            if (currentOrder[field] && !value.note)
              throw new CrmError('Вкажіть причину зміни фактичної дати або повернення статусу');
            actualChanges.push({
              field,
              before: currentOrder[field] || null,
              after: value[field] || null
            });
          }
        }
      }
      const planChanged =
        (current.plannedIntakeDate || '') !== value.plannedIntakeDate ||
        (current.plannedDeliveryDate || '') !== value.plannedDeliveryDate;
      if (currentStatus === value.status && !planChanged && !actualChanges.length && !value.note)
        return;
      if (value.kind === 'request')
        this.db
          .prepare(
            'UPDATE crm_requests SET plannedIntakeDate = ?, plannedDeliveryDate = ?, workflowRevision = workflowRevision + 1 WHERE id = ?'
          )
          .run(value.plannedIntakeDate || null, value.plannedDeliveryDate || null, value.id);
      else
        this.db
          .prepare(
            'UPDATE crm_orders SET status = ?, plannedIntakeDate = ?, plannedDeliveryDate = ?, actualIntakeDate = ?, actualReadyDate = ?, actualDeliveryDate = ?, workflowRevision = workflowRevision + 1 WHERE id = ?'
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
        actor,
        kind: value.kind,
        recordId: value.id,
        fromStatus: currentStatus,
        toStatus: value.status,
        previousIntakeDate: current.plannedIntakeDate,
        previousDeliveryDate: current.plannedDeliveryDate,
        plannedIntakeDate: value.plannedIntakeDate || null,
        plannedDeliveryDate: value.plannedDeliveryDate || null,
        note: value.note,
        actualDateChanges: actualChanges
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
    (globalDb.crmSchemaVersion !== 12 || !(globalDb.crmRepository instanceof CrmRepository))
  ) {
    globalDb.crmRepository.close();
    globalDb.crmRepository = undefined;
  }
  globalDb.crmSchemaVersion = 12;
  return (globalDb.crmRepository ??= new CrmRepository(
    process.env.CRM_DATABASE_PATH || resolve('data/crm.sqlite')
  ));
}

/** One registry per configured installation; every organization gets a bound database. */
export class OrganizationRepositories {
  private readonly legacy: CrmRepository;
  private readonly scoped = new Map<string, CrmRepository>();
  constructor(
    private readonly filename: string,
    private readonly configuredAdmin?: string
  ) {
    this.legacy = new CrmRepository(filename);
  }
  forOrganization(orgId: string, userId: string, isAdmin: boolean): CrmRepository {
    if (!/^org_[a-zA-Z0-9]+$/.test(orgId)) throw new CrmError('Некоректна автомалярка');
    if (this.legacy.organizationId() === orgId) return this.legacy;
    const existing = this.scoped.get(orgId);
    const filename = `${this.filename}.org-${createHash('sha256').update(orgId).digest('hex')}.sqlite`;
    const candidate = existing ?? new CrmRepository(filename);
    candidate.bindOrganization(orgId);
    this.scoped.set(orgId, candidate);
    // Never shadow business data written to a new shop with the owner's legacy database.
    if (
      isAdmin &&
      !candidate.hasBusinessData() &&
      this.legacy.claimOrganization(orgId, userId, this.configuredAdmin)
    )
      return this.legacy;
    return candidate;
  }
  close(): void {
    this.legacy.close();
    for (const repository of this.scoped.values()) repository.close();
  }
}

const orgRegistry = globalThis as typeof globalThis & {
  crmOrganizations?: {
    filename: string;
    configuredAdmin?: string;
    repositories: OrganizationRepositories;
  };
};
export function getOrganizationRepository(
  orgId: string,
  userId: string,
  isAdmin: boolean
): CrmRepository {
  const filename = process.env.CRM_DATABASE_PATH || resolve('data/crm.sqlite');
  const configuredAdmin = process.env.CRM_ADMIN_USER_ID;
  const cached = orgRegistry.crmOrganizations;
  if (
    !cached ||
    cached.filename !== filename ||
    cached.configuredAdmin !== configuredAdmin ||
    !(cached.repositories instanceof OrganizationRepositories)
  ) {
    cached?.repositories.close();
    orgRegistry.crmOrganizations = {
      filename,
      configuredAdmin,
      repositories: new OrganizationRepositories(filename, configuredAdmin)
    };
  }
  return orgRegistry.crmOrganizations!.repositories.forOrganization(orgId, userId, isAdmin);
}
