import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { CrmRepository } from '../src/features/crm/server/repository';
import { orderSchema } from '../src/features/crm/schemas/crm';
import { overviewMetrics } from '../src/features/overview/lib/metrics';
import { overviewTrends } from '../src/features/overview/lib/trends';

// All generated records live in a disposable database, never in data/ or AWS.
const directory = mkdtempSync(join(tmpdir(), 'crm-read-benchmark-'));
const filename = join(directory, 'benchmark.sqlite');
const repository = new CrmRepository(filename),
  db = new DatabaseSync(filename);
const orders = 10_000,
  movements = 100_000;
try {
  const actor = { id: 'benchmark-admin', name: 'Benchmark' };
  const customerId = repository.createCustomer({
    name: 'Тестовий клієнт',
    phone: '0501234567',
    notes: ''
  });
  const vehicleId = repository.createVehicle({
    customerId,
    make: 'Ford',
    model: 'Focus',
    year: 2020,
    plate: 'TEST0001',
    vin: 'WVWZZZ1JZXW000001'
  });
  const seedId = repository.createClientOrder(
    orderSchema.parse({
      customerId,
      vehicleId,
      requestId: '',
      assigneeId: 'painter',
      description: 'Тестовий ремонт',
      items: [{ description: 'Бампер', quantity: 1, unitPrice: 1000 }]
    }),
    'Маляр',
    actor
  );
  const itemIds = Array.from({ length: 200 }, (_, index) =>
    repository.inventory.createItem({
      name: `Матеріал ${String(index).padStart(3, '0')}`,
      unit: 'л',
      notes: `SKU-${index}`,
      tags: index % 2 ? ['Фарба', 'Фарба_чорна'] : ['Розхідник']
    })
  );
  repository.inventory.receive(
    {
      itemId: itemIds[0],
      operationId: randomUUID(),
      quantity: '1',
      currency: 'UAH',
      totalAmount: '100',
      exchangeRate: '1',
      note: ''
    },
    actor
  );
  function copier(table: string) {
    const seed = db.prepare(`SELECT * FROM ${table} LIMIT 1`).get()!;
    const columns = Object.keys(seed);
    const insert = db.prepare(
      `INSERT INTO ${table} (${columns.map((column) => `"${column}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`
    );
    return (changes: Record<string, SQLInputValue>) =>
      insert.run(
        ...columns.map((column) =>
          changes[column] === undefined ? (seed[column] as SQLInputValue) : changes[column]
        )
      );
  }
  const copyOrder = copier('crm_orders'),
    copyMovement = copier('stock_movements'),
    copyEvent = copier('crm_workflow_events');
  const addItem = db.prepare(
    'INSERT INTO crm_order_items(orderId,position,description,quantity,unitPriceCents) VALUES (?,0,?,1,100000)'
  );
  db.exec('BEGIN');
  for (let index = 1; index < orders; index++) {
    const id = randomUUID(),
      status = index % 3 === 0 ? 'ready' : index % 3 === 1 ? 'in_progress' : 'created';
    copyOrder({
      id,
      number: index + 1,
      status,
      actualReadyDate: status === 'ready' ? '2026-01-15' : null,
      createdAt: '2026-01-01T10:00:00Z'
    });
    addItem.run(id, 'Бампер');
    copyEvent({
      id: randomUUID(),
      recordId: id,
      toStatus: status,
      createdAt: '2026-01-01T10:00:00Z'
    });
  }
  for (let index = 1; index < movements; index++)
    copyMovement({
      id: randomUUID(),
      itemId: itemIds[index % itemIds.length],
      deltaMilli: 1,
      costDeltaCents: 1,
      fingerprint: randomUUID(),
      createdAt: index < 100 ? '2026-11-10T10:00:00Z' : '2026-01-01T10:00:00Z'
    });
  db.exec('COMMIT');
  db.exec('ANALYZE');
  const results: unknown[] = [];
  function measure(name: string, read: () => unknown): void {
    globalThis.gc?.();
    const heap = process.memoryUsage().heapUsed;
    const start = performance.now();
    const result = read();
    const queryMs = performance.now() - start;
    const json = JSON.stringify(result);
    results.push({
      name,
      queryMs: Math.round(queryMs * 100) / 100,
      jsonBytes: Buffer.byteLength(json),
      heapDeltaMiB: Math.round((process.memoryUsage().heapUsed - heap) / 10485.76) / 100,
      rssMiB: Math.round(process.memoryUsage().rss / 10485.76) / 100
    });
  }
  measure('orders.page50', () => repository.reads.list({ entity: 'orders', pageSize: 50 }));
  measure('orders.search.page50', () =>
    repository.reads.list({ entity: 'orders', search: 'БАМПЕР', pageSize: 50 })
  );
  measure('inventory.page50', () =>
    repository.inventory.listItems({ search: '', tags: [], archived: false, pageSize: 50 })
  );
  measure('movements.page50', () => repository.inventory.listMovements({ pageSize: 50 }));
  measure('order.detail', () => repository.reads.order(seedId));
  measure('overview.server', () => {
    const source = repository.reads.overviewSource();
    const metrics = overviewMetrics(source, '2026-11-24');
    return {
      metrics: {
        ...metrics,
        attention: metrics.attention.slice(0, 10),
        schedule: metrics.schedule.slice(0, 10)
      },
      trends: overviewTrends(source, '2026-11-24', metrics)
    };
  });
  measure('payroll.source.period', () =>
    repository.reportSnapshot({ from: '2026-11-01', to: '2026-11-30' }, true)
  );
  measure('reports.source.period', () =>
    repository.reportSnapshot({ from: '2026-11-01', to: '2026-11-30', orderDate: 'ready' })
  );
  const optimizedPeakRSSMiB = Math.round(process.resourceUsage().maxRSS / 1024);
  measure('legacy.workspace', () => repository.workspace());
  measure('legacy.inventory', () => ({
    items: repository.inventory.items(),
    movements: repository.inventory.movements()
  }));
  process.stdout.write(
    JSON.stringify(
      {
        environment: {
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          orders,
          movements,
          materials: itemIds.length,
          optimizedPeakRSSMiB,
          note: 'Local SQLite reads; excludes Clerk network, Next.js HTTP overhead and AWS concurrency. RSS includes the generator and TypeScript loader.'
        },
        results
      },
      null,
      2
    ) + '\n'
  );
} finally {
  db.close();
  repository.close();
  rmSync(directory, { recursive: true, force: true });
}
