'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from './action-button';
import { FormStatus, type SaveProps } from './form-status';
import { crmMutations, crmQueries } from '../api/queries';
import type { RepairOrder } from '../api/types';
import { executorTransition } from '../lib/executor-workflow';

export function ExecutorAdvance({
  order,
  onSaved,
  onStateChange
}: { order: RepairOrder } & SaveProps) {
  const client = useQueryClient();
  const input = {
    id: order.id,
    expectedStatus: order.status,
    expectedRevision: order.workflowRevision ?? 0
  };
  const possible = executorTransition(order, input);
  const label = order.status === 'in_progress' ? 'Позначити готовим' : 'Позначити виданим';
  const mutation = useMutation({
    ...crmMutations.advance(),
    onSuccess: () => {
      toast.success('Статус оновлено');
      onSaved();
    },
    onSettled: () => client.invalidateQueries({ queryKey: crmQueries.all() })
  });
  return (
    <div className='flex flex-col gap-3'>
      <FormStatus dirty={false} pending={mutation.isPending} onChange={onStateChange} />
      {mutation.error && (
        <Alert variant='destructive'>
          <AlertDescription>{mutation.error.message}</AlertDescription>
        </Alert>
      )}
      {!possible.ok ? (
        <p className='text-sm text-muted-foreground'>{possible.error}</p>
      ) : (
        <>
          <p className='text-sm text-muted-foreground'>
            Дату переходу буде зафіксовано автоматично. Зміна плану, цін і повернення статусу
            доступні адміністратору.
          </p>
          <Button
            type='button'
            aria-label={label}
            isLoading={mutation.isPending}
            onClick={() => mutation.mutate(input)}
          >
            {label}
          </Button>
        </>
      )}
    </div>
  );
}
