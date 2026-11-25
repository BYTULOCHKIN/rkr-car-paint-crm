import { overviewOrderPredicate } from '@/features/overview/server/order-filter';
import { uniqueRecords as unique } from '@/features/crm/lib/pagination';
import type { DatabaseSync } from 'node:sqlite';
import type {
  CrmWorkspace,
  RepairOrder,
  WorkflowEvent,
  PaymentEvent,
  TeamMember,
  CrmAccess
} from '../api/types';
import { crmListSchema, type CrmListFilters, type WorkspaceSelection } from '../schemas/reads';
import { CrmError } from './repository';
import { normalizeSearch } from '../lib/pagination';
import { reportDate } from '@/features/workshop-reports/lib/report';
import { matchesSearchText } from '@/lib/search';
import { paymentBalanceFromPaid } from '../lib/payment-balance';
import { orderAccessPredicate } from './order-access';

const contactText = (customer: string) =>
  `COALESCE((SELECT group_concat(value, ' ') FROM crm_customer_contacts WHERE customerId=${customer}), '')`;
const vehicleText = (alias: string) =>
  `${alias}.make || ' ' || ${alias}.model || ' ' || COALESCE(${alias}.plate,'') || ' ' || COALESCE(${alias}.vin,'') || ' ' || COALESCE(${alias}.year,'')`;

export class CrmReadRepository {
  constructor(
    private db: DatabaseSync,
    private project: (selection: WorkspaceSelection) => CrmWorkspace
  ) {
    db.function('crm_choice_match', { deterministic: true }, (text, query) =>
      Number(matchesSearchText(String(text ?? ''), String(query ?? '')))
    );
    db.function('crm_day', { deterministic: true }, (value) => reportDate(String(value ?? '')));
    db.exec(`CREATE INDEX IF NOT EXISTS crm_orders_status_number ON crm_orders(deletedAt,status,number DESC);
      CREATE INDEX IF NOT EXISTS crm_orders_customer ON crm_orders(customerId,number DESC);
      CREATE INDEX IF NOT EXISTS crm_orders_vehicle ON crm_orders(vehicleId,number DESC);
      CREATE INDEX IF NOT EXISTS crm_requests_vehicle ON crm_requests(vehicleId);
      CREATE INDEX IF NOT EXISTS crm_workflow_record ON crm_workflow_events(recordId,createdAt);
      CREATE INDEX IF NOT EXISTS stock_movements_created ON stock_movements(createdAt DESC);
      CREATE INDEX IF NOT EXISTS stock_items_archive_name ON stock_items(archived,name,id);`);
  }

  private ids(table: string, field: string, ids: string[]): string[] {
    if (!ids.length) return [];
    return this.db
      .prepare(`SELECT id FROM ${table} WHERE ${field} IN (SELECT value FROM json_each(?))`)
      .all(JSON.stringify(ids))
      .map((row) => row.id as string);
  }

  selection(orderIds: string[], extra: Partial<WorkspaceSelection> = {}): WorkspaceSelection {
    const refs = orderIds.length
      ? this.db
          .prepare(
            `SELECT customerId,vehicleId,requestId FROM crm_orders WHERE id IN (SELECT value FROM json_each(?))`
          )
          .all(JSON.stringify(orderIds))
      : [];
    return {
      orderIds,
      customerIds: [...new Set(refs.map((row) => row.customerId as string))],
      vehicleIds: [...new Set(refs.map((row) => row.vehicleId as string))],
      requestIds: [...new Set(refs.map((row) => row.requestId as string).filter(Boolean))],
      ...extra
    };
  }

  list(input: CrmListFilters, team: TeamMember[] = [], access?: CrmAccess): CrmWorkspace {
    const filters = crmListSchema.parse(input);
    if (
      access?.role === 'worker' &&
      (filters.trash || !['orders', 'kanban'].includes(filters.entity))
    )
      throw new CrmError('Цей розділ доступний адміністратору');
    if (filters.entity === 'kanban') {
      const statuses = ['created', 'in_progress', 'ready'] as const;
      const parts = statuses.map((status) =>
        this.list(
          {
            ...filters,
            entity: 'orders',
            status,
            sort: JSON.stringify([
              { id: 'plannedDeliveryDate', desc: false },
              { id: 'createdAt', desc: false }
            ])
          },
          team,
          access
        )
      );
      const visibility = orderAccessPredicate(access, 'o');
      return {
        ...parts[0],
        customers: unique(parts.flatMap((part) => part.customers)),
        vehicles: unique(parts.flatMap((part) => part.vehicles)),
        orders: unique(parts.flatMap((part) => part.orders)),
        paymentSummaries: Object.assign({}, ...parts.map((part) => part.paymentSummaries)),
        boardCounts: Object.fromEntries(
          statuses.map((status, index) => [status, parts[index].pagination!.total])
        ),
        boardTotal: this.db
          .prepare(
            `SELECT COUNT(*) AS total FROM crm_orders o WHERE o.deletedAt ${filters.trash ? 'IS NOT NULL' : 'IS NULL'} AND ${visibility.sql}`
          )
          .get(...visibility.params)!.total as number,
        pagination: {
          page: filters.page,
          pageSize: filters.pageSize,
          total: parts.reduce((sum, part) => sum + part.pagination!.total, 0)
        }
      };
    }
    const entity = filters.entity;
    const table = {
      customers: 'crm_customers',
      vehicles: 'crm_vehicles',
      orders: 'crm_orders',
      requests: 'crm_requests'
    }[entity];
    const joins =
      entity === 'customers'
        ? ''
        : entity === 'vehicles'
          ? 'LEFT JOIN crm_customers c ON c.id=t.customerId'
          : 'JOIN crm_customers c ON c.id=t.customerId JOIN crm_vehicles v ON v.id=t.vehicleId';
    const text =
      entity === 'customers'
        ? `t.name || ' ' || t.notes || ' ' || ${contactText('t.id')} || ' ' || COALESCE((SELECT group_concat(${vehicleText('v')}, ' ') FROM crm_vehicles v WHERE v.customerId=t.id),'')`
        : entity === 'vehicles'
          ? `${vehicleText('t')} || ' ' || COALESCE(c.name,'')`
          : `t.description || ' ' || c.name || ' ' || ${contactText('c.id')} || ' ' || ${vehicleText('v')}${entity === 'orders' ? " || ' ' || t.number || ' ' || COALESCE(t.assigneeName,'') || ' ' || COALESCE((SELECT group_concat(description,' ') FROM crm_order_items WHERE orderId=t.id),'')" : ''}`;
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (entity === 'orders') {
      conditions.push(filters.trash ? 't.deletedAt IS NOT NULL' : 't.deletedAt IS NULL');
      const visibility = orderAccessPredicate(access, 't');
      conditions.push(visibility.sql);
      params.push(...visibility.params);
    }
    if (filters.overviewMetric) {
      const predicate = overviewOrderPredicate(filters.overviewMetric, {
        from: filters.overviewFrom!,
        to: filters.overviewTo!
      });
      conditions.push(`(${predicate.sql})`);
      params.push(...predicate.params);
    }
    if (filters.customerId && entity !== 'customers') {
      conditions.push('t.customerId=?');
      params.push(filters.customerId);
    }
    if (filters.vehicleId && (entity === 'orders' || entity === 'requests')) {
      conditions.push('t.vehicleId=?');
      params.push(filters.vehicleId);
    }
    if (filters.status !== 'all' && entity === 'orders') {
      conditions.push(
        filters.status === 'ready' ? "t.status IN ('ready','delivered')" : 't.status=?'
      );
      if (filters.status !== 'ready') params.push(filters.status);
    }
    if (filters.status !== 'all' && entity === 'requests')
      conditions.push("t.status <> 'converted'");
    if (filters.search) {
      const matching =
        entity === 'orders'
          ? team
              .filter((member) =>
                normalizeSearch(member.name).includes(normalizeSearch(filters.search))
              )
              .map((member) => member.id)
          : [];
      conditions.push(
        `(${filters.lookup ? `crm_choice_match(${text},?)=1` : `instr(crm_search(${text}), ?) > 0`}${matching.length ? ` OR t.assigneeId IN (${matching.map(() => '?').join(',')})` : ''})`
      );
      params.push(normalizeSearch(filters.search), ...matching);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sortable: Record<string, string> =
      entity === 'customers'
        ? { name: 't.name', createdAt: 't.createdAt' }
        : entity === 'vehicles'
          ? { make: 't.make', model: 't.model', year: 't.year', vin: 't.vin', plate: 't.plate' }
          : entity === 'requests'
            ? { createdAt: 't.createdAt', description: 't.description' }
            : {
                number: 't.number',
                createdAt: 't.createdAt',
                plannedDeliveryDate: "COALESCE(t.plannedDeliveryDate,'9999')",
                status: 't.status',
                description: 't.description',
                totalCents:
                  '(SELECT COALESCE(SUM(quantity*unitPriceCents),0) FROM crm_order_items WHERE orderId=t.id)',
                total:
                  '(SELECT COALESCE(SUM(quantity*unitPriceCents),0) FROM crm_order_items WHERE orderId=t.id)'
              };
    let order =
      entity === 'customers'
        ? `t.createdAt ${filters.customerOrder === 'oldest' ? 'ASC' : 'DESC'},t.id`
        : entity === 'vehicles'
          ? 't.createdAt DESC,t.id DESC'
          : entity === 'orders'
            ? 't.number DESC,t.id'
            : 't.createdAt DESC,t.id';
    if (filters.sort) {
      try {
        const parsed: unknown = JSON.parse(filters.sort);
        if (Array.isArray(parsed)) {
          const parts = parsed.flatMap((item: unknown) => {
            if (
              !item ||
              typeof item !== 'object' ||
              !('id' in item) ||
              typeof item.id !== 'string' ||
              !sortable[item.id]
            )
              return [];
            return [
              `${sortable[item.id]} ${'desc' in item && item.desc === true ? 'DESC' : 'ASC'}`
            ];
          });
          if (parts.length) order = [...parts, 't.id'].join(',');
        }
      } catch {
        /* Unknown URL sorting falls back to the stable default. */
      }
    }
    const total = this.db
      .prepare(`SELECT COUNT(*) AS total FROM ${table} t ${joins} ${where}`)
      .get(...params)!.total as number;
    const ids = this.db
      .prepare(`SELECT t.id FROM ${table} t ${joins} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...params, filters.pageSize, (filters.page - 1) * filters.pageSize)
      .map((row) => row.id as string);
    let selection = this.selection(entity === 'orders' ? ids : []);
    if (filters.trash) selection.includeTrashed = true;
    if (entity === 'customers')
      selection = {
        ...selection,
        customerIds: ids,
        vehicleIds: this.ids('crm_vehicles', 'customerId', ids)
      };
    if (entity === 'vehicles') {
      const customers = ids.length
        ? this.db
            .prepare(
              `SELECT DISTINCT customerId FROM crm_vehicles WHERE id IN (SELECT value FROM json_each(?))`
            )
            .all(JSON.stringify(ids))
            .map((row) => row.customerId as string)
            .filter(Boolean)
        : [];
      selection = { ...selection, vehicleIds: ids, customerIds: customers };
    }
    if (entity === 'requests') {
      const refs = ids.length
        ? this.db
            .prepare(
              `SELECT customerId,vehicleId FROM crm_requests WHERE id IN (SELECT value FROM json_each(?))`
            )
            .all(JSON.stringify(ids))
        : [];
      selection = {
        ...selection,
        orderIds: this.ids('crm_orders', 'requestId', ids),
        requestIds: ids,
        customerIds: [...new Set(refs.map((row) => row.customerId as string))],
        vehicleIds: [...new Set(refs.map((row) => row.vehicleId as string))]
      };
    }
    const result = this.project(selection);
    if (entity === 'orders') {
      const selected = JSON.stringify(ids);
      const paid = new Map(
        this.db
          .prepare(`SELECT orderId,SUM(CASE WHEN kind IN ('payment','refund_reversal') THEN amountCents ELSE -amountCents END) AS paid FROM (
        SELECT orderId,kind,amountCents FROM crm_payments WHERE orderId IN (SELECT value FROM json_each(?))
        UNION ALL SELECT orderId,kind,amountCents FROM crm_customer_refunds WHERE orderId IN (SELECT value FROM json_each(?))
      ) GROUP BY orderId`)
          .all(selected, selected)
          .map((row) => [row.orderId as string, row.paid as number])
      );
      result.paymentSummaries = Object.fromEntries(
        result.orders.map((order) => [
          order.id,
          paymentBalanceFromPaid(order, paid.get(order.id) ?? 0)
        ])
      );
    }
    if (entity === 'vehicles') {
      const linked = new Map(
        this.db
          .prepare(
            `SELECT v.id,(EXISTS(SELECT 1 FROM crm_orders WHERE vehicleId=v.id AND deletedAt IS NULL) OR EXISTS(SELECT 1 FROM crm_requests WHERE vehicleId=v.id)) AS linked FROM crm_vehicles v WHERE v.id IN (SELECT value FROM json_each(?))`
          )
          .all(JSON.stringify(ids))
          .map((row) => [row.id as string, !!row.linked])
      );
      result.vehicles = result.vehicles.map((vehicle) => ({
        ...vehicle,
        linked: linked.get(vehicle.id) ?? false
      }));
    }
    if (entity === 'orders')
      result.hasLegacyRequests = !!this.db
        .prepare('SELECT EXISTS(SELECT 1 FROM crm_requests) AS present')
        .get()!.present;
    if (entity === 'requests')
      result.summaryCounts = this.db
        .prepare(`SELECT
      (SELECT COUNT(*) FROM crm_customers) AS customers,(SELECT COUNT(*) FROM crm_vehicles) AS vehicles,
      (SELECT COUNT(*) FROM crm_orders WHERE deletedAt IS NULL AND status='created') AS created,
      (SELECT COUNT(*) FROM crm_orders WHERE deletedAt IS NULL AND status NOT IN ('ready','delivered')) AS active,
      (SELECT COUNT(*) FROM crm_orders WHERE deletedAt IS NULL AND status='ready') AS ready`)
        .get() as NonNullable<CrmWorkspace['summaryCounts']>;
    const positions = new Map(ids.map((id, index) => [id, index]));
    result[entity].sort((a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0));
    return {
      ...result,
      serverRead: true,
      pagination: { total, page: filters.page, pageSize: filters.pageSize }
    };
  }

  order(id: string, access?: CrmAccess): CrmWorkspace {
    const result = this.findOrder(id, access);
    if (!result) throw new CrmError('Замовлення не знайдено');
    return result;
  }

  findOrder(id: string, access?: CrmAccess): CrmWorkspace | null {
    const visibility = orderAccessPredicate(access, 'o');
    if (
      !this.db
        .prepare(
          `SELECT id FROM crm_orders o WHERE o.id=? AND o.deletedAt IS NULL AND ${visibility.sql}`
        )
        .get(id, ...visibility.params)
    )
      return null;
    return {
      ...this.project(this.selection([id], { payments: true, finance: true })),
      serverRead: true
    };
  }

  workspace(access: CrmAccess): CrmWorkspace {
    const visibility = orderAccessPredicate(access, 'o');
    const ids = this.db
      .prepare(`SELECT id FROM crm_orders o WHERE o.deletedAt IS NULL AND ${visibility.sql}`)
      .all(...visibility.params)
      .map((row) => row.id as string);
    return this.project(this.selection(ids, { payments: true, finance: true, history: true }));
  }

  overviewSource(): CrmWorkspace {
    const orders = this.db
      .prepare(`SELECT o.*,COALESCE(t.total,0) AS totalCents FROM crm_orders o
      LEFT JOIN (SELECT orderId,SUM(quantity*unitPriceCents) AS total FROM crm_order_items GROUP BY orderId) t ON t.orderId=o.id
      WHERE o.deletedAt IS NULL ORDER BY o.number DESC`)
      .all()
      .map((row) => ({ ...row, items: [], paintPlan: [] })) as unknown as RepairOrder[];
    const events = this.db
      .prepare(`SELECT e.recordId,e.kind,e.fromStatus,e.toStatus,e.createdAt,e.actualDateChanges,
      json_extract(e.orderChanges,'$.before.totalCents') AS previousTotal,json_extract(e.orderChanges,'$.after.totalCents') AS nextTotal
      FROM crm_workflow_events e JOIN crm_orders o ON o.id=e.recordId WHERE e.kind='order' AND o.deletedAt IS NULL ORDER BY e.createdAt DESC,e.rowid DESC`)
      .all()
      .map((row) => ({
        ...row,
        actualDateChanges:
          typeof row.actualDateChanges === 'string' ? JSON.parse(row.actualDateChanges) : null,
        orderChanges:
          row.previousTotal === null
            ? null
            : { before: { totalCents: row.previousTotal }, after: { totalCents: row.nextTotal } }
      })) as unknown as WorkflowEvent[];
    const payments = this.db
      .prepare(`SELECT p.id,p.orderId,p.kind,p.amountCents,p.reversalOf,p.createdAt FROM crm_payments p JOIN crm_orders o ON o.id=p.orderId WHERE o.deletedAt IS NULL UNION ALL
      SELECT p.id,p.orderId,p.kind,p.amountCents,p.reversalOf,p.createdAt FROM crm_customer_refunds p JOIN crm_orders o ON o.id=p.orderId WHERE o.deletedAt IS NULL`)
      .all() as unknown as PaymentEvent[];
    const requests = this.db
      .prepare(
        "SELECT id,customerId,vehicleId,description,createdAt,plannedIntakeDate,plannedDeliveryDate,workflowRevision,CASE WHEN status='converted' THEN 'converted' WHEN plannedIntakeDate IS NOT NULL THEN 'scheduled' ELSE 'backlog' END AS status FROM crm_requests"
      )
      .all() as unknown as CrmWorkspace['requests'];
    const orderProfits = Object.fromEntries(
      this.db
        .prepare(
          `SELECT p.orderId,json_extract(p.snapshot,'$.result.workshopRemainderCents') AS profit FROM crm_economics_postings p JOIN crm_orders o ON o.id=p.orderId WHERE o.deletedAt IS NULL AND p.revision=(SELECT MAX(revision) FROM crm_economics_postings WHERE orderId=p.orderId)`
        )
        .all()
        .filter((row) => typeof row.profit === 'number')
        .map((row) => [row.orderId, row.profit])
    );
    return { orders, events, payments, requests, customers: [], vehicles: [], orderProfits };
  }

  display(orderIds: string[]): CrmWorkspace {
    return { ...this.project(this.selection(orderIds)), serverRead: true };
  }

  counts(): { customers: number; vehicles: number } {
    return this.db
      .prepare(
        'SELECT (SELECT COUNT(*) FROM crm_customers) AS customers,(SELECT COUNT(*) FROM crm_vehicles) AS vehicles'
      )
      .get() as { customers: number; vehicles: number };
  }

  reportOpening(from: string): NonNullable<CrmWorkspace['reportOpening']> {
    return this.db
      .prepare(`SELECT e.orderId,e.payeeKind,e.payeeId,
      (SELECT payeeName FROM crm_settlement_events n WHERE n.orderId=e.orderId AND n.payeeKind=e.payeeKind AND n.payeeId=e.payeeId AND crm_day(n.createdAt)<? ORDER BY n.createdAt DESC,n.rowid DESC LIMIT 1) AS payeeName,
      SUM(CASE WHEN e.kind='payout' THEN -e.amountCents WHEN e.kind='reversal' THEN CASE WHEN original.kind='payout' THEN e.amountCents ELSE -e.amountCents END ELSE e.amountCents END) AS openingBalance
      FROM crm_settlement_events e LEFT JOIN crm_settlement_events original ON original.id=e.reversalOf
      WHERE crm_day(e.createdAt)<? GROUP BY e.orderId,e.payeeKind,e.payeeId HAVING openingBalance<>0`)
      .all(from, from)
      .map((row) => ({
        orderId: row.orderId as string,
        payee: {
          id: row.payeeId as string,
          name: row.payeeName as string,
          kind: row.payeeKind as 'worker' | 'contractor'
        },
        amountCents: row.openingBalance as number
      }));
  }

  reportSelection(
    from: string,
    to: string,
    payroll: boolean,
    orderDate: 'ready' | 'created' | 'delivered' = 'ready',
    opening: NonNullable<CrmWorkspace['reportOpening']> = []
  ): WorkspaceSelection {
    const date =
      orderDate === 'created'
        ? 'crm_day(createdAt)'
        : orderDate === 'ready'
          ? 'actualReadyDate'
          : 'actualDeliveryDate';
    const union = payroll
      ? `SELECT orderId AS id FROM crm_economics_postings WHERE crm_day(createdAt) BETWEEN ? AND ? OR crm_day(createdAt) IS NULL
      UNION SELECT id FROM crm_orders WHERE actualReadyDate BETWEEN ? AND ? AND status='ready'`
      : `SELECT id FROM crm_orders WHERE ${date} BETWEEN ? AND ?${orderDate === 'created' ? ' OR crm_day(createdAt) IS NULL' : ''}
      UNION SELECT orderId AS id FROM crm_economics_postings WHERE crm_day(createdAt) BETWEEN ? AND ? OR crm_day(createdAt) IS NULL
      UNION SELECT orderId AS id FROM crm_settlement_events WHERE crm_day(createdAt) BETWEEN ? AND ? OR crm_day(createdAt) IS NULL
      UNION SELECT orderId AS id FROM crm_payments WHERE crm_day(createdAt) BETWEEN ? AND ? OR crm_day(createdAt) IS NULL
      UNION SELECT orderId AS id FROM crm_customer_refunds WHERE crm_day(createdAt) BETWEEN ? AND ? OR crm_day(createdAt) IS NULL
      UNION SELECT orderId AS id FROM stock_movements WHERE orderId IS NOT NULL AND (crm_day(createdAt) BETWEEN ? AND ? OR crm_day(createdAt) IS NULL)`;
    const params = payroll
      ? [from, to, from, to]
      : [from, to, from, to, from, to, from, to, from, to, from, to];
    const ids = [
      ...new Set([
        ...this.db
          .prepare(`SELECT id FROM crm_orders WHERE deletedAt IS NULL AND id IN (${union})`)
          .all(...params)
          .map((row) => row.id as string),
        ...opening.map((row) => row.orderId)
      ])
    ];
    return this.selection(ids, { summaryOnly: true });
  }

  history(
    kind: 'order' | 'customer' | 'vehicle' | 'request',
    id: string,
    access?: CrmAccess
  ): CrmWorkspace {
    if (access?.role === 'worker' && kind !== 'order')
      throw new CrmError('Цей розділ доступний адміністратору');
    if (kind === 'request') {
      const request = this.db
        .prepare('SELECT customerId,vehicleId FROM crm_requests WHERE id=?')
        .get(id);
      if (!request) throw new CrmError('Заявку не знайдено');
      return this.project({
        orderIds: this.ids('crm_orders', 'requestId', [id]),
        requestIds: [id],
        customerIds: [request.customerId as string],
        vehicleIds: [request.vehicleId as string],
        history: true
      });
    }
    if (kind === 'order') {
      const result = this.order(id, access);
      const history = this.project(this.selection([id], { history: true }));
      return { ...result, events: history.events };
    }
    const ids = this.db
      .prepare(
        `SELECT id FROM crm_orders WHERE ${kind === 'customer' ? 'customerId' : 'vehicleId'}=? AND deletedAt IS NULL ORDER BY number DESC`
      )
      .all(id)
      .map((row) => row.id as string);
    const selection = this.selection(ids, { payments: true });
    if (kind === 'customer') {
      selection.customerIds = [id];
      selection.vehicleIds = this.ids('crm_vehicles', 'customerId', [id]);
    } else {
      selection.vehicleIds = [id];
      const owner = this.db
        .prepare('SELECT customerId FROM crm_vehicles WHERE id=?')
        .get(id)?.customerId;
      if (typeof owner === 'string')
        selection.customerIds = [...new Set([...selection.customerIds, owner])];
    }
    selection.requestIds = this.ids('crm_requests', 'vehicleId', selection.vehicleIds);
    return this.project(selection);
  }
}
