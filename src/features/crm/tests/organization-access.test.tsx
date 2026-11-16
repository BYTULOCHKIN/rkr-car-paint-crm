import { beforeEach, expect, test, vi } from 'vitest';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { getOrganizationRepository } from '../server/repository';
import { getOrganizationContext } from '../server/organization';
import type { CrmWorkspace, RepairOrder } from '../api/types';
import {
  updateOrder,
  createCustomer,
  createOrder,
  getOrderDocument,
  getWorkspace
} from '../api/service';
import { crmQueries } from '../api/queries';

vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn(), clerkClient: vi.fn() }));
vi.mock('../server/repository', () => ({
  CrmError: class CrmError extends Error {},
  getOrganizationRepository: vi.fn()
}));
const memberships = vi.fn();
const workspace: CrmWorkspace = {
  customers: [],
  vehicles: [],
  orders: [],
  requests: [],
  events: []
};
const repository = {
  workspace: vi.fn(() => workspace),
  createCustomer: vi.fn(),
  createOrder: vi.fn(() => 'order-created'),
  updateOrder: vi.fn()
};
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

test('creating an order validates a mandatory active member of the current organization, including an admin', async () => {
  const input = {
    customerId: '00000000-0000-4000-8000-000000000001',
    vehicleId: '00000000-0000-4000-8000-000000000002',
    requestId: '',
    description: 'Фарбування',
    items: [{ description: 'Робота', quantity: 1, unitPrice: 100 }]
  };
  expect((await createOrder(input)).ok).toBe(false);
  expect((await createOrder({ ...input, assigneeId: 'user_foreign' })).ok).toBe(false);
  expect(repository.createOrder).not.toHaveBeenCalled();
  expect((await createOrder({ ...input, assigneeId: 'user_admin' })).ok).toBe(true);
  expect(repository.createOrder).toHaveBeenCalledWith(
    expect.objectContaining({ assigneeId: 'user_admin' }),
    'Олена',
    { id: 'user_admin', name: 'Олена' }
  );
});

test('reassignment validates the new member, preserves inactive historical assignees, and cannot spoof the actor', async () => {
  const current: RepairOrder = {
    id: '00000000-0000-4000-8000-000000000001',
    number: 1,
    requestId: null,
    customerId: 'c',
    vehicleId: 'v',
    description: 'Роботи',
    createdAt: '',
    status: 'in_progress',
    plannedIntakeDate: null,
    plannedDeliveryDate: null,
    actualIntakeDate: '2020-01-01',
    actualReadyDate: null,
    actualDeliveryDate: null,
    items: [{ description: 'Робота', quantity: 1, unitPriceCents: 10000 }],
    totalCents: 10000,
    assigneeId: 'user_removed',
    assigneeName: 'Колишній маляр'
  };
  repository.workspace.mockReturnValue({ ...workspace, orders: [current] });
  const input = {
    id: current.id,
    description: 'Оновлено',
    items: [{ description: 'Робота', quantity: 1, unitPrice: 100 }]
  };
  expect((await updateOrder({ ...input, assigneeId: 'user_removed' })).ok).toBe(true);
  expect(repository.updateOrder).toHaveBeenLastCalledWith(
    expect.objectContaining({ assigneeId: undefined }),
    undefined,
    { id: 'user_admin', name: 'Олена' }
  );
  expect((await updateOrder({ ...input, assigneeId: 'user_other_org' })).ok).toBe(false);
  const forged = { ...input, assigneeId: 'user_admin', actor: { id: 'forged', name: 'Підробка' } };
  expect((await updateOrder(forged)).ok).toBe(true);
  expect(repository.updateOrder).toHaveBeenLastCalledWith(
    expect.objectContaining({ assigneeId: 'user_admin' }),
    'Олена',
    { id: 'user_admin', name: 'Олена' }
  );
});
