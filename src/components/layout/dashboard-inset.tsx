import type { ComponentProps, ReactElement } from 'react';
import { SidebarInset } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

// The main flex item must shrink beside the sidebar. Without min-w-0, wide
// tables and Kanban boards expand the entire page instead of their scroll area.
export function DashboardInset({
  className,
  ...props
}: ComponentProps<typeof SidebarInset>): ReactElement {
  return <SidebarInset {...props} className={cn('min-w-0', className)} />;
}
