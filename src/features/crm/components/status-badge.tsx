import type { ComponentProps, ReactElement } from 'react';
import { HistoryBadge } from './history-badge';
import { statusLabel } from '../lib/workflow';

interface StatusBadgeProps {
  status: string;
}

const statusTones = new Map<string, NonNullable<ComponentProps<typeof HistoryBadge>['tone']>>([
  ['created', 'warning'],
  ['in_progress', 'info'],
  ['ready', 'ready'],
  ['backlog', 'warning'],
  ['scheduled', 'warning'],
  ['delivered', 'success']
]);

export function StatusBadge({ status }: StatusBadgeProps): ReactElement {
  return (
    <HistoryBadge tone={statusTones.get(status) ?? 'neutral'} className='border-0'>
      {statusLabel(status)}
    </HistoryBadge>
  );
}
