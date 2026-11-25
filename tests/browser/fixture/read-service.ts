import { overviewFacts, matchesOverviewOrder } from '@/features/overview/lib/cohorts';
import { paymentBalance } from '@/features/crm/lib/payment-balance';
import { contactSearchValues } from '@/features/crm/lib/customer-contacts';
import { uniqueRecords as unique } from '@/features/crm/lib/pagination';
import { getWorkspace, getOrderTrash } from './service';
import { crmListSchema, type CrmListFilters } from '@/features/crm/schemas/reads';
import type { CrmWorkspace } from '@/features/crm/api/types';
import { matchesSearchText } from '@/lib/search';
import { normalizeSearch } from '@/features/crm/lib/pagination';

function scope(data: CrmWorkspace, ids: string[]): CrmWorkspace {
  const orders = data.orders.filter((order) => ids.includes(order.id));
  return {
    ...data,
    serverRead: true,
    orders,
    customers: data.customers.filter((customer) =>
      orders.some((order) => order.customerId === customer.id)
    ),
    vehicles: data.vehicles.filter((vehicle) =>
      orders.some((order) => order.vehicleId === vehicle.id)
    ),
    requests: [],
    events: [],
    payments: (data.payments ?? []).filter((event) => ids.includes(event.orderId))
  };
}

export async function getCrmList(_orgId: string, input: CrmListFilters): Promise<CrmWorkspace> {
  const filters = crmListSchema.parse(input);
  if (filters.entity === 'kanban') {
    const statuses = ['created', 'in_progress', 'ready'] as const;
    const parts = await Promise.all(
      statuses.map((status) => getCrmList(_orgId, { ...filters, entity: 'orders', status }))
    );
    return {
      ...parts[0],
      orders: unique(parts.flatMap((part) => part.orders)),
      customers: unique(parts.flatMap((part) => part.customers)),
      vehicles: unique(parts.flatMap((part) => part.vehicles)),
      pagination: {
        page: filters.page,
        pageSize: filters.pageSize,
        total: parts.reduce((sum, part) => sum + part.pagination!.total, 0)
      },
      boardTotal: (await getWorkspace()).orders.length,
      boardCounts: Object.fromEntries(
        statuses.map((status, index) => [status, parts[index].pagination!.total])
      )
    };
  }
  const data = filters.trash ? await getOrderTrash(_orgId) : await getWorkspace();
  const query = normalizeSearch(filters.search);
  const customers = new Map(data.customers.map((row) => [row.id, row]));
  const vehicles = new Map(data.vehicles.map((row) => [row.id, row]));
  const facts = overviewFacts(data);
  const factsById = new Map(facts.orders.map((fact) => [fact.order.id, fact]));
  const rows = data[filters.entity].filter((row) => {
    if (filters.overviewMetric) {
      const fact = factsById.get(row.id);
      if (
        !fact ||
        !matchesOverviewOrder(fact, facts, filters.overviewMetric, {
          from: filters.overviewFrom!,
          to: filters.overviewTo!
        })
      )
        return false;
    }
    if ('customerId' in row && filters.customerId && row.customerId !== filters.customerId)
      return false;
    if ('vehicleId' in row && filters.vehicleId && row.vehicleId !== filters.vehicleId)
      return false;
    if (
      'status' in row &&
      filters.status !== 'all' &&
      (filters.entity === 'requests'
        ? row.status === 'converted'
        : filters.status === 'ready'
          ? !['ready', 'delivered'].includes(row.status)
          : row.status !== filters.status)
    )
      return false;
    const customer = 'customerId' in row ? customers.get(row.customerId ?? '') : row;
    const vehicle = 'vehicleId' in row ? vehicles.get(row.vehicleId) : row;
    const related =
      filters.entity === 'customers'
        ? data.vehicles.filter((vehicle) => vehicle.customerId === row.id)
        : [];
    const contactValues = customer && 'phone' in customer ? contactSearchValues(customer) : [];
    const searchable = JSON.stringify([row, customer, vehicle, related, contactValues]);
    return filters.lookup
      ? matchesSearchText(searchable, query)
      : normalizeSearch(searchable).includes(query);
  });
  if (filters.entity === 'customers')
    rows.sort(
      (a, b) =>
        ('createdAt' in a ? ('createdAt' in b ? a.createdAt!.localeCompare(b.createdAt!) : 0) : 0) *
        (filters.customerOrder === 'oldest' ? 1 : -1)
    );
  const selected = rows.slice(
    (filters.page - 1) * filters.pageSize,
    filters.page * filters.pageSize
  );
  const result =
    filters.entity === 'orders'
      ? scope(
          data,
          selected.map((row) => row.id)
        )
      : { ...data, orders: [], events: [], payments: [], requests: [] };
  Object.assign(result, { [filters.entity]: selected });
  if (filters.entity === 'orders')
    result.paymentSummaries = Object.fromEntries(
      result.orders.map((order) => [order.id, paymentBalance(order, data.payments)])
    );
  if (filters.entity === 'vehicles')
    result.vehicles = result.vehicles.map((vehicle) => ({
      ...vehicle,
      linked:
        data.requests.some((request) => request.vehicleId === vehicle.id) ||
        data.orders.some((order) => order.vehicleId === vehicle.id)
    }));
  if (filters.entity === 'requests')
    result.orders = data.orders.filter((order) =>
      selected.some((request) => request.id === order.requestId)
    );
  return {
    ...result,
    serverRead: true,
    hasLegacyRequests: data.requests.length > 0,
    pagination: { total: rows.length, page: filters.page, pageSize: filters.pageSize }
  };
}

export async function getCrmDetail(
  _orgId: string,
  kind: 'order' | 'history',
  id: string,
  entity: 'order' | 'customer' | 'vehicle' | 'request' = 'order'
): Promise<CrmWorkspace> {
  const data = await getWorkspace();
  if (data.access?.role === 'worker') {
    if (kind === 'history' && entity !== 'order')
      throw new Error('Цей розділ доступний адміністратору');
    if (!data.orders.some((order) => order.id === id)) throw new Error('Замовлення не знайдено');
  }
  if (kind === 'order') return scope(data, [id]);
  if (entity === 'request')
    return {
      ...data,
      serverRead: true,
      requests: data.requests.filter((request) => request.id === id),
      events: data.events.filter((event) => event.recordId === id)
    };
  if (entity === 'order')
    return { ...scope(data, [id]), events: data.events.filter((event) => event.recordId === id) };
  const orders = data.orders.filter((order) =>
    entity === 'customer' ? order.customerId === id : order.vehicleId === id
  );
  return { ...data, serverRead: true, orders };
}
