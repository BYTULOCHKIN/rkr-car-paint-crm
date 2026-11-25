import { getOverview } from '@/features/overview/api/service';
import { beforeEach, expect, test, vi } from 'vitest';
import { auth } from '@clerk/nextjs/server';
import { GET as readCrm } from '@/app/api/crm/read/route';
import { GET as readMovements } from '@/app/api/inventory/movements/route';
import { getOrganizationContext } from '../server/organization';
import { CrmError } from '../server/repository';
import type { CrmWorkspace } from '../api/types';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));
vi.mock('../server/organization', () => ({ getOrganizationContext: vi.fn() }));
vi.mock('../server/repository', () => ({ CrmError: class CrmError extends Error {} }));
const id = '00000000-0000-4000-8000-000000000001';
const data: CrmWorkspace = { customers: [], vehicles: [], requests: [], orders: [], events: [] };
const repository = {
  reads: { list: vi.fn(() => data), order: vi.fn(() => data), history: vi.fn(() => data) },
  inventory: { listMovements: vi.fn(() => ({ items: [], total: 0, page: 1, pageSize: 50 })) }
};
const context = {
  repository,
  access: { userId: 'user_A', orgId: 'org_A', role: 'admin' as 'admin' | 'worker' },
  team: []
};
beforeEach(() => {
  vi.clearAllMocks();
  context.access.role = 'admin';
  vi.mocked(auth).mockResolvedValue({ userId: 'user_A', orgId: 'org_A' } as Awaited<
    ReturnType<typeof auth>
  >);
  vi.mocked(getOrganizationContext).mockResolvedValue(
    context as unknown as Awaited<ReturnType<typeof getOrganizationContext>>
  );
});
const request = (query: string) =>
  new Request(`http://localhost/api/crm/read?orgId=org_A&${query}`);

test('read endpoints reject anonymous users, stale organizations and removed memberships before reading rows', async () => {
  vi.mocked(auth).mockResolvedValue({ userId: null, orgId: null } as Awaited<
    ReturnType<typeof auth>
  >);
  expect((await readCrm(request('kind=list&entity=orders'))).status).toBe(401);
  expect((await readMovements(request(''))).status).toBe(401);
  vi.mocked(auth).mockResolvedValue({ userId: 'user_A', orgId: 'org_B' } as Awaited<
    ReturnType<typeof auth>
  >);
  expect((await readCrm(request('kind=list&entity=orders'))).status).toBe(403);
  expect(getOrganizationContext).not.toHaveBeenCalled();
  vi.mocked(auth).mockResolvedValue({ userId: 'user_A', orgId: 'org_A' } as Awaited<
    ReturnType<typeof auth>
  >);
  vi.mocked(getOrganizationContext).mockRejectedValue(new CrmError('Членство відкликано'));
  expect((await readCrm(request('kind=list&entity=orders'))).status).toBe(403);
  expect(repository.reads.list).not.toHaveBeenCalled();
});

test('CRM list and detail reads validate pagination and pass filters to the organization repository', async () => {
  const response = await readCrm(request('kind=list&entity=orders&page=2&pageSize=10&search=Ford'));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(repository.reads.list).toHaveBeenCalledWith(
    expect.objectContaining({
      entity: 'orders',
      page: 2,
      pageSize: 10,
      search: 'Ford',
      trash: false
    }),
    []
  );
  expect((await readCrm(request(`kind=order&id=${id}`))).status).toBe(200);
  expect(repository.reads.order).toHaveBeenCalledWith(id);
  for (const query of [
    'kind=list&entity=orders&pageSize=101',
    'kind=list&entity=other',
    'kind=list&entity=orders&trash=wrong',
    'kind=order&id=invalid',
    'kind=unknown'
  ])
    expect((await readCrm(request(query))).status).toBe(400);
});

test('workers cannot read administrative lists or trash; scoped order and movement reads remain available', async () => {
  context.access.role = 'worker';
  for (const entity of ['customers', 'vehicles', 'requests'])
    expect((await readCrm(request(`kind=list&entity=${entity}`))).status).toBe(403);
  expect((await readCrm(request('kind=list&entity=orders&trash=true'))).status).toBe(403);
  expect((await readCrm(request('kind=list&entity=orders'))).status).toBe(200);
  expect((await readMovements(request(`page=2&pageSize=25&itemId=${id}`))).status).toBe(200);
  expect(repository.inventory.listMovements).toHaveBeenCalledWith(
    expect.objectContaining({ itemId: id, page: 2, pageSize: 25 })
  );
  expect((await readMovements(request('pageSize=101'))).status).toBe(400);
});

test('overview drilldown validates its full date scope and keeps organization isolation', async () => {
  const range = '&overviewMetric=profit&overviewFrom=2026-11-01&overviewTo=2026-11-25';
  expect((await readCrm(request('kind=list&entity=orders' + range))).status).toBe(200);
  expect(repository.reads.list).toHaveBeenCalledWith(
    expect.objectContaining({
      overviewMetric: 'profit',
      overviewFrom: '2026-11-01',
      overviewTo: '2026-11-25'
    }),
    []
  );
  for (const query of [
    'entity=orders&overviewMetric=profit',
    'entity=customers' + range,
    'entity=orders&overviewMetric=profit&overviewFrom=2026-11-25&overviewTo=2026-11-01'
  ])
    expect((await readCrm(request('kind=list&' + query))).status).toBe(400);
  await expect(getOverview('org_other', '2026-11-25')).rejects.toThrow(/Огляд доступний/);
  context.access.role = 'worker';
  await expect(getOverview('org_A', '2026-11-25')).rejects.toThrow(/Огляд доступний/);
});
