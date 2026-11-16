import 'server-only';

import { cache } from 'react';
import { auth, clerkClient } from '@clerk/nextjs/server';
import type { TeamMember, CrmAccess } from '../api/types';
import { CrmError, getOrganizationRepository } from './repository';

/** Memberships come from Clerk on every request, so removals/role changes apply immediately. */
export const getOrganizationContext = cache(async () => {
  const { userId, orgId } = await auth();
  if (!userId) throw new CrmError('Увійдіть у свій обліковий запис');
  if (!orgId) throw new CrmError('Оберіть або створіть автомалярку в розділі «Автомалярки».');
  const client = await clerkClient();
  const team: TeamMember[] = [];
  let offset = 0;
  while (true) {
    const page = await client.organizations.getOrganizationMembershipList({
      organizationId: orgId,
      limit: 100,
      offset
    });
    for (const membership of page.data) {
      const user = membership.publicUserData;
      if (!user || !['org:admin', 'org:member'].includes(membership.role)) continue;
      team.push({
        id: user.userId,
        name:
          [user.firstName, user.lastName].filter(Boolean).join(' ') ||
          user.identifier ||
          user.userId,
        identifier: user.identifier,
        role: membership.role === 'org:admin' ? 'admin' : 'worker'
      });
    }
    offset += page.data.length;
    if (!page.data.length || offset >= page.totalCount) break;
  }
  const member = team.find((member) => member.id === userId);
  if (!member) throw new CrmError('У вас немає активного доступу до цієї автомалярки.');
  const access: CrmAccess = { userId, orgId, role: member.role };
  const repository = getOrganizationRepository(orgId, userId, member.role === 'admin');
  return { repository, access, team };
});
