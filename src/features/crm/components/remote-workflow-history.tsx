'use client';

import { useQuery } from '@tanstack/react-query';
import { crmQueries } from '../api/queries';
import type { CrmWorkspace, WorkflowRecord } from '../api/types';
import { WorkflowHistory } from './workflow-history';
import { Button } from '@/components/ui/button';

export function RemoteWorkflowHistory({
  target,
  data
}: {
  target: WorkflowRecord;
  data: CrmWorkspace;
}) {
  const result = useQuery(
    crmQueries.detail(data.access!.userId, data.access!.orgId, target.record.id, 'history', 'order')
  );
  if (result.isPending) return <p role='status'>Завантажуємо історію…</p>;
  if (result.isError)
    return (
      <div role='alert'>
        Не вдалося завантажити історію.{' '}
        <Button onClick={() => void result.refetch()}>Повторити</Button>
      </div>
    );
  return <WorkflowHistory target={target} data={result.data} />;
}
