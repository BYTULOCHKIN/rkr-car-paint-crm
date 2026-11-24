import { beforeEach, expect, test, vi } from 'vitest';
import { auth } from '@clerk/nextjs/server';
import { GET } from '@/app/api/inventory/items/route';
import { getOrganizationContext } from '../server/organization';
import { CrmError } from '../server/repository';
import { filterStockItems } from '@/features/inventory/lib/search';
import type { InventoryFilters, StockItem } from '@/features/inventory/api/types';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));
vi.mock('../server/organization', () => ({ getOrganizationContext: vi.fn() }));
vi.mock('../server/repository', () => ({ CrmError: class CrmError extends Error {} }));
let items: StockItem[];
const repository = {
  inventory: {
    listItems: vi.fn((filters: InventoryFilters) => {
      const matching = filterStockItems(items, filters.search, filters.tags, filters.archived);
      const page = filters.page ?? 1,
        pageSize = filters.pageSize ?? 50;
      return {
        items: matching.slice((page - 1) * pageSize, page * pageSize),
        total: matching.length,
        page,
        pageSize
      };
    })
  }
};
beforeEach(() => {
  vi.clearAllMocks();
  items = [];
  vi.mocked(auth).mockResolvedValue({ userId: 'user_A', orgId: 'org_A' } as Awaited<
    ReturnType<typeof auth>
  >);
  vi.mocked(getOrganizationContext).mockResolvedValue({
    repository,
    access: { userId: 'user_A', orgId: 'org_A', role: 'worker' },
    team: []
  } as unknown as Awaited<ReturnType<typeof getOrganizationContext>>);
});

test('HTTP inventory search applies text, multiple tags and archive filters to scoped stock data', async () => {
  const base: StockItem = {
    id: 'paint',
    name: 'Емаль Sprint',
    unit: 'л',
    notes: 'SKU: TEST-001',
    tags: ['Фарба', 'Фарба_чорна'],
    archived: false,
    locked: false,
    balanceMilli: 0,
    totalCostCents: 0,
    valuationRevision: 0
  };
  items = [
    base,
    { ...base, id: 'lacquer', name: 'Лак Sprint', notes: '', tags: ['Розхідник'] },
    { ...base, id: 'archive', name: 'Архів Sprint', archived: true, tags: ['Розхідник'] }
  ];
  const response = await GET(
    new Request(
      'http://localhost/api/inventory/items?orgId=org_A&search=SPRINT&tag=Фарба_чорна&tag=Розхідник&archived=false'
    )
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect((await response.json()).items.map((item: { name: string }) => item.name)).toEqual([
    'Емаль Sprint',
    'Лак Sprint'
  ]);
  const bySku = await GET(
    new Request('http://localhost/api/inventory/items?orgId=org_A&search=TEST-001')
  );
  expect((await bySku.json()).items).toHaveLength(1);
  const archive = await GET(
    new Request('http://localhost/api/inventory/items?orgId=org_A&archived=true')
  );
  expect((await archive.json()).items[0].id).toBe('archive');
});

test('HTTP inventory search rejects signed-out, stale organization and removed membership access', async () => {
  vi.mocked(auth).mockResolvedValue({ userId: null, orgId: null } as Awaited<
    ReturnType<typeof auth>
  >);
  expect((await GET(new Request('http://localhost/api/inventory/items?orgId=org_A'))).status).toBe(
    401
  );
  expect(getOrganizationContext).not.toHaveBeenCalled();
  vi.mocked(auth).mockResolvedValue({ userId: 'user_A', orgId: 'org_A' } as Awaited<
    ReturnType<typeof auth>
  >);
  expect((await GET(new Request('http://localhost/api/inventory/items?orgId=org_B'))).status).toBe(
    403
  );
  expect(getOrganizationContext).not.toHaveBeenCalled();
  vi.mocked(getOrganizationContext).mockRejectedValue(new CrmError('Немає активного членства'));
  expect((await GET(new Request('http://localhost/api/inventory/items?orgId=org_A'))).status).toBe(
    403
  );
});

test('HTTP inventory search validates unknown tags and invalid search parameters before reading data', async () => {
  for (const query of ['tag=Вигаданий', 'archived=unknown', `search=${'a'.repeat(501)}`]) {
    expect(
      (await GET(new Request(`http://localhost/api/inventory/items?orgId=org_A&${query}`))).status
    ).toBe(400);
  }
  expect(getOrganizationContext).not.toHaveBeenCalled();
});
