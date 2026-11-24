'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { crmMutations, crmQueries } from '../api/queries';
import type { CrmAccess, RepairOrder } from '../api/types';
import { Button } from './action-button';
import { FormStatus, type SaveProps } from './form-status';
import { DialogActions } from './dialog-form';

export function OrderTrashAction({
  order,
  access,
  restore = false,
  onSaved,
  onCancel,
  onStateChange
}: SaveProps & { order: RepairOrder; access: CrmAccess; restore?: boolean }) {
  const client = useQueryClient();
  const mutation = useMutation({
    ...crmMutations.trash(),
    onSuccess: () => {
      toast.success(restore ? 'Замовлення відновлено' : 'Замовлення переміщено в кошик');
      onSaved();
    },
    onSettled: () => client.invalidateQueries({ queryKey: crmQueries.all() })
  });
  const blocked = !restore && order.trashBlockedReason;
  return (
    <div className='flex flex-col gap-4'>
      <FormStatus dirty={false} pending={mutation.isPending} onChange={onStateChange} />
      <p>
        {restore
          ? `Відновити замовлення №${order.number}? Повернуться його попередній статус, роботи та ціни.`
          : `Перемістити замовлення №${order.number} в кошик? Воно зникне з робочих списків. Його можна буде відновити.`}
      </p>
      {!restore && (
        <p className='text-muted-foreground text-sm'>
          Доступно для замовлень без складських і фінансових операцій. Скасовані операції також
          залишаються в історії.
        </p>
      )}
      {blocked && (
        <Alert>
          <AlertDescription>Переміщення недоступне: {blocked}</AlertDescription>
        </Alert>
      )}
      {mutation.error && (
        <Alert variant='destructive'>
          <AlertDescription>{mutation.error.message}</AlertDescription>
        </Alert>
      )}
      <DialogActions>
        <Button variant='outline' onClick={onCancel} disabled={mutation.isPending}>
          Скасувати
        </Button>
        <Button
          variant={restore ? 'default' : 'destructive'}
          isLoading={mutation.isPending}
          disabled={!!blocked}
          onClick={() =>
            mutation.mutate({
              orgId: access.orgId,
              orderId: order.id,
              expectedRevision: order.workflowRevision ?? 0,
              action: restore ? 'restore' : 'trash'
            })
          }
        >
          {restore ? 'Відновити замовлення' : 'Перемістити в кошик'}
        </Button>
      </DialogActions>
    </div>
  );
}
