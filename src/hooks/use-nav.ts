'use client';

import { useMemo } from 'react';
import { useOrganization } from '@clerk/nextjs';
import type { NavItem, NavGroup } from '@/types';
import { resolveNavigation, type NavigationAccess } from '@/lib/nav-access';

interface NavigationOptions {
  includeUnavailable?: boolean;
}

function useNavigationAccess(): NavigationAccess {
  const { organization, membership } = useOrganization();
  return useMemo(
    () => ({
      hasOrg: !!organization?.id,
      role: membership?.role,
      permissions: membership?.permissions ?? []
    }),
    [organization?.id, membership?.role, membership?.permissions]
  );
}

/** UX only: every page and action must also enforce access on the server. */
export function useFilteredNavItems(
  items: NavItem[],
  { includeUnavailable = false }: NavigationOptions = {}
): NavItem[] {
  const context = useNavigationAccess();
  return useMemo(
    () => resolveNavigation(items, context, includeUnavailable),
    [items, context, includeUnavailable]
  );
}

export function useFilteredNavGroups(
  groups: NavGroup[],
  { includeUnavailable = false }: NavigationOptions = {}
): NavGroup[] {
  const context = useNavigationAccess();
  return useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: resolveNavigation(group.items, context, includeUnavailable)
        }))
        .filter((group) => group.items.length > 0),
    [groups, context, includeUnavailable]
  );
}
