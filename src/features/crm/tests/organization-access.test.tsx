import { beforeEach, expect, test, vi } from 'vitest';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getOrganizationRepository } from '../server/repository';
import { getOrganizationContext } from '../server/organization';
import { createCustomer, getOrderDocument, getWorkspace } from '../api/service';
import { crmQueries } from '../api/queries';

vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(), clerkClient: vi.fn() }));
vi.mock('../server/repository', () => ({
  CrmError: class CrmError extends Error {},
  getOrganizationRepository: vi.fn()
}));
const memberships = vi.fn();
const workspace = { customers: [], vehicles: [], orders: [], requests: [], events: [] };
const repository = { workspace: vi.fn(() => workspace), createCustomer: vi.fn() };
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getOrganizationRepository).mockReturnValue(
    repository as unknown as ReturnType<typeof getOrganizationRepository>
  );
  vi.mocked(auth).mockResolvedValue({ userId: 'user_admin', orgId: 'org_A' } as unknown as Awaited<
    ReturnType<typeof auth>
  >);
  vi.mocked(clerkClient).mockResolvedValue({
    organizations: { getOrganizationMembershipList: memberships }
  } as unknown as Awaited<ReturnType<typeof clerkClient>>);
  memberships.mockResolvedValue({
    totalCount: 1,
    data: [
      {
        role: 'org:admin',
        publicUserData: {
          userId: 'user_admin',
          firstName: 'Олена',
          identifier: 'owner@example.com'
        },
        privateMetadata: { sensitive: true }
      }
    ]
  });
});

test('membership and role are read from Clerk and private metadata is not exposed', async () => {
  const data = await getWorkspace();
  expect(data.access).toEqual({ userId: 'user_admin', orgId: 'org_A', role: 'admin' });
  expect(data.team).toEqual([
    { id: 'user_admin', name: 'Олена', identifier: 'owner@example.com', role: 'admin' }
  ]);
  expect(getOrganizationRepository).toHaveBeenCalledWith('org_A', 'user_admin', true);
  expect(crmQueries.workspace('user_admin', 'org_A').queryKey).not.toEqual(
    crmQueries.workspace('user_admin', 'org_B').queryKey
  );
});

test('missing session, missing organization, removed membership and unknown role fail closed', async () => {
  vi.mocked(auth).mockResolvedValue({ userId: null, orgId: null } as unknown as Awaited<
    ReturnType<typeof auth>
  >);
  await expect(getOrganizationContext()).rejects.toThrow('Увійдіть');
  vi.mocked(auth).mockResolvedValue({ userId: 'user_admin', orgId: null } as unknown as Awaited<
    ReturnType<typeof auth>
  >);
  await expect(getOrganizationContext()).rejects.toThrow('Оберіть');
  vi.mocked(auth).mockResolvedValue({ userId: 'user_admin', orgId: 'org_A' } as unknown as Awaited<
    ReturnType<typeof auth>
  >);
  memberships.mockResolvedValue({ totalCount: 0, data: [] });
  await expect(getOrganizationContext()).rejects.toThrow('активного доступу');
  memberships.mockResolvedValue({
    totalCount: 1,
    data: [{ role: 'org:custom', publicUserData: { userId: 'user_admin' } }]
  });
  await expect(getOrganizationContext()).rejects.toThrow('активного доступу');
  expect(getOrganizationRepository).not.toHaveBeenCalled();
});

test('worker cannot invoke an administrative action and foreign print IDs are not found', async () => {
  memberships.mockResolvedValue({
    totalCount: 1,
    data: [
      {
        role: 'org:member',
        publicUserData: { userId: 'user_admin', identifier: 'worker@example.com' }
      }
    ]
  });
  const result = await createCustomer({ name: 'Спроба', phone: '0501234567', notes: '' });
  expect(result.ok).toBe(false);
  expect(repository.workspace().customers).toHaveLength(0);
  expect(await getOrderDocument('other-org-order')).toBeNull();
});
