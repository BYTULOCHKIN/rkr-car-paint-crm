'use client';

import { useEffect, type ReactElement } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/features/crm/components/action-button';
import { DialogActions } from '@/features/crm/components/dialog-form';
import { crmQueries } from '@/features/crm/api/queries';
import { inventoryMutations, inventoryQueries } from '../api/queries';
import type { StockItem } from '../api/types';
import { stockItemDeleteBlocker } from '../lib/deletion';

interface DeleteStockItemProps {
  orgId: string;
  item: StockItem;
  onDeleted: () => void;
  onCancel: () => void;
  onPendingChange: (pending: boolean) => void;
}

export function DeleteStockItem({
  orgId,
  item,
  onDeleted,
  onCancel,
  onPendingChange
}: DeleteStockItemProps): ReactElement {
  const client = useQueryClient();
  const mutation = useMutation({
    ...inventoryMutations.delete(orgId),
    onSuccess: () => {
      toast.success('Позицію видалено назавжди');
      onDeleted();
    },
    onError: (error) => toast.error(error.message),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: inventoryQueries.all() }),
        client.invalidateQueries({ queryKey: crmQueries.all() })
      ])
  });
  useEffect(() => {
    onPendingChange(mutation.isPending);
    return () => onPendingChange(false);
  }, [mutation.isPending, onPendingChange]);
  const blocked = stockItemDeleteBlocker(item);
  return (
    <div className='flex flex-col gap-4'>
      <p>
        Видалити позицію «{item.name}» назавжди? Вона зникне зі складу й списків вибору матеріалів.
        Відновити позицію буде неможливо.
      </p>
      {blocked && (
        <Alert>
          <AlertDescription>{blocked}</AlertDescription>
        </Alert>
      )}
      {mutation.error && (
        <Alert variant='destructive'>
          <AlertDescription>{mutation.error.message}</AlertDescription>
        </Alert>
      )}
      <DialogActions>
        <Button type='button' variant='outline' disabled={mutation.isPending} onClick={onCancel}>
          Скасувати
        </Button>
        <Button
          type='button'
          aria-label='Видалити назавжди'
          variant='destructive'
          disabled={!!blocked}
          isLoading={mutation.isPending}
          onClick={() =>
            mutation.mutate({
              id: item.id,
              expectedName: item.name,
              expectedArchived: item.archived
            })
          }
        >
          Видалити назавжди
        </Button>
      </DialogActions>
    </div>
  );
}
