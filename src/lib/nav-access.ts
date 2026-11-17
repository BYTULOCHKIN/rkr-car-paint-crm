import type { NavItem, PermissionCheck } from '@/types';

export interface NavigationAccess {
  hasOrg: boolean;
  role?: string;
  permissions: readonly string[];
}

function canAccess(access: PermissionCheck | undefined, context: NavigationAccess): boolean {
  if (!access) return true;
  if (access.requireOrg && !context.hasOrg) return false;
  if (access.role && (!context.hasOrg || access.role !== context.role)) return false;
  if (access.permission && (!context.hasOrg || !context.permissions.includes(access.permission)))
    return false;
  // Plans/features continue to be enforced by the server, as in the template.
  return true;
}

/** Sidebar retains unavailable entries; navigation shortcuts exclude them entirely. */
export function resolveNavigation(
  items: NavItem[],
  context: NavigationAccess,
  includeUnavailable = false,
  parentDisabled = false
): NavItem[] {
  return items.flatMap((item) => {
    const disabled = parentDisabled || !!item.disabled || !canAccess(item.access, context);
    if (disabled && !includeUnavailable) return [];
    return [
      {
        ...item,
        disabled,
        ...(item.items
          ? { items: resolveNavigation(item.items, context, includeUnavailable, disabled) }
          : {})
      }
    ];
  });
}
