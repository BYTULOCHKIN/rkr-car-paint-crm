import { HistoryBadge } from './history-badge';
import { statusLabel } from '../lib/workflow';

export function StatusBadge({ status }: { status: string }) {
  return (
    <HistoryBadge
      tone={
        status === 'delivered'
          ? 'success'
          : status === 'in_progress'
            ? 'info'
            : status === 'ready'
              ? 'ready'
              : status === 'created' || status === 'backlog' || status === 'scheduled'
                ? 'warning'
                : 'neutral'
      }
    >
      {statusLabel(status)}
    </HistoryBadge>
  );
}
