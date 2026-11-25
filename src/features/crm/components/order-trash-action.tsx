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
  action = 'trash',
  onSaved,
  onCancel,
  onStateChange
}: SaveProps & { order: RepairOrder; access: CrmAccess; action?: 'trash' | 'restore' | 'delete' }) {
  const client = useQueryClient();
  const restore = action === 'restore';
  const permanent = action === 'delete';
  const mutation = useMutation({
    ...crmMutations.trash(),
    onSuccess: () => {
      toast.success(
        permanent
          ? 'Замовлення видалено назавжди'
          : restore
            ? 'Замовлення відновлено'
            : 'Замовлення переміщено в кошик'
      );
      onSaved();
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => client.invalidateQueries({ queryKey: crmQueries.all() })
  });
  const blocked = !restore && order.trashBlockedReason;
  const label = permanent
    ? 'Видалити назавжди'
    : restore
      ? 'Відновити замовлення'
      : 'Перемістити в кошик';
  return (
    <div className='flex flex-col gap-4'>
      <FormStatus dirty={false} pending={mutation.isPending} onChange={onStateChange} />
      <p>
        {permanent
          ? `Видалити замовлення №${order.number} назавжди? Його роботи, ціни та історію буде видалено. Відновити замовлення буде неможливо.`
          : restore
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
          <AlertDescription>
            {permanent ? 'Видалення недоступне:' : 'Переміщення недоступне:'} {blocked}
          </AlertDescription>
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
          aria-label={label}
          isLoading={mutation.isPending}
          disabled={!!blocked}
          onClick={() =>
            mutation.mutate({
              orgId: access.orgId,
              orderId: order.id,
              expectedRevision: order.workflowRevision ?? 0,
              action
            })
          }
        >
          {label}
        </Button>
      </DialogActions>
    </div>
  );
}
