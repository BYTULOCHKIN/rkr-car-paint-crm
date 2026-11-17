'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAppForm } from '@/lib/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FieldGroup } from '@/components/ui/field';
import { HistoryBadge } from './history-badge';
import { Button } from './action-button';
import { FormStatus, type FormState } from './form-status';
import { paymentBalance } from '../lib/payment-balance';
import { paymentSchema } from '../schemas/payment';
import { crmMutations, crmQueries } from '../api/queries';
import type { CrmWorkspace } from '../api/types';
import { money } from './format';

export function OrderPayments({
  orderId,
  data,
  disabled = false,
  onStateChange
}: {
  orderId: string;
  disabled?: boolean;
  data: CrmWorkspace;
  onStateChange: (state: FormState) => void;
}) {
  const client = useQueryClient();
  const [mode, setMode] = useState<string | null>(null);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const order = data.orders.find((entry) => entry.id === orderId)!;
  const events = (data.payments ?? []).filter((entry) => entry.orderId === orderId);
  const balance = paymentBalance(order, events);
  const admin = data.access?.role === 'admin';
  const feedback = {
    onSuccess: () => {
      toast.success(mode === 'receive' ? 'Оплату записано' : 'Платіж скасовано');
      setMode(null);
      form.reset();
      setOperationId(crypto.randomUUID());
    },
    onSettled: () => client.invalidateQueries({ queryKey: crmQueries.all() })
  };
  const receive = useMutation({ ...crmMutations.receivePayment(), ...feedback });
  const reverse = useMutation({ ...crmMutations.reversePayment(), ...feedback });
  const pending = receive.isPending || reverse.isPending;
  const form = useAppForm({
    defaultValues: { paymentAmount: '', paymentNote: '' },
    validators: {
      onSubmit: z.object({
        paymentAmount: mode === 'receive' ? paymentSchema.shape.amount : z.string(),
        paymentNote:
          mode === 'receive'
            ? z.string().trim().max(1000)
            : z.string().trim().min(1, 'Вкажіть причину скасування').max(1000)
      })
    },
    onSubmit: async ({ value }) => {
      if (!data.access || !mode || pending || disabled) return;
      if (mode === 'receive')
        await receive
          .mutateAsync({
            orgId: data.access.orgId,
            input: { orderId, operationId, amount: value.paymentAmount, note: value.paymentNote }
          })
          .catch(() => undefined);
      else
        await reverse
          .mutateAsync({
            orgId: data.access.orgId,
            input: { paymentId: mode, operationId, note: value.paymentNote }
          })
          .catch(() => undefined);
    }
  });
  function start(next: string | null) {
    form.reset();
    receive.reset();
    reverse.reset();
    setOperationId(crypto.randomUUID());
    setMode(next);
  }
  return (
    <section
      aria-label='Оплати замовлення'
      className='flex min-w-0 flex-col gap-3 rounded-xl border p-4'
    >
      <form.Subscribe selector={(state) => !state.isDefaultValue}>
        {(dirty) => (
          <FormStatus dirty={!!mode && dirty} pending={pending} onChange={onStateChange} />
        )}
      </form.Subscribe>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <h3 className='font-semibold'>Оплата</h3>
        <HistoryBadge
          tone={balance.remainingCents === 0 ? 'success' : balance.paidCents ? 'info' : 'warning'}
        >
          {balance.status}
        </HistoryBadge>
      </div>
      <dl className='grid grid-cols-2 gap-3 text-sm'>
        <div>
          <dt className='text-muted-foreground'>Отримано</dt>
          <dd className='break-words font-semibold tabular-nums [overflow-wrap:anywhere]'>
            {money(balance.paidCents)}
          </dd>
        </div>
        <div>
          <dt className='text-muted-foreground'>
            {order.status === 'delivered' ? 'Заборгованість' : 'Залишок до сплати'}
          </dt>
          <dd className='break-words font-semibold tabular-nums [overflow-wrap:anywhere]'>
            {money(balance.remainingCents)}
          </dd>
        </div>
      </dl>
      {admin && !mode && balance.remainingCents > 0 && (
        <Button
          type='button'
          variant='outline'
          disabled={disabled}
          onClick={() => start('receive')}
        >
          Додати оплату
        </Button>
      )}
      {mode && admin && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FieldGroup className='gap-3'>
            {mode === 'receive' && (
              <form.AppField name='paymentAmount'>
                {(field) => (
                  <field.TextField
                    label='Сума оплати, грн'
                    required
                    inputMode='decimal'
                    disabled={pending || disabled}
                  />
                )}
              </form.AppField>
            )}
            <form.AppField name='paymentNote'>
              {(field) => (
                <field.TextField
                  label={mode === 'receive' ? 'Примітка до оплати' : 'Причина скасування платежу'}
                  required={mode !== 'receive'}
                  maxLength={1000}
                  disabled={pending || disabled}
                />
              )}
            </form.AppField>
            {(receive.error || reverse.error) && (
              <Alert variant='destructive'>
                <AlertDescription>{(receive.error || reverse.error)!.message}</AlertDescription>
              </Alert>
            )}
            <div className='flex flex-wrap gap-2'>
              <Button type='submit' isLoading={pending} disabled={disabled}>
                {mode === 'receive' ? 'Записати оплату' : 'Підтвердити скасування платежу'}
              </Button>
              <Button
                type='button'
                variant='outline'
                disabled={pending || disabled}
                onClick={() => start(null)}
              >
                Скасувати введення
              </Button>
            </div>
          </FieldGroup>
        </form>
      )}
      {events.length ? (
        <ol className='flex flex-col divide-y text-sm'>
          {events.toReversed().map((entry) => {
            const cancelled = events.some((event) => event.reversalOf === entry.id);
            return (
              <li
                key={entry.id}
                className='flex min-w-0 flex-col gap-1 py-3 [overflow-wrap:anywhere]'
              >
                <div className='flex flex-wrap justify-between gap-2'>
                  <span className='font-medium'>
                    {entry.kind === 'reversal' ? 'Скасування оплати' : 'Оплата'} ·{' '}
                    {money(entry.amountCents)}
                  </span>
                  {cancelled && <span className='text-muted-foreground'>Скасовано</span>}
                </div>
                <p className='text-xs text-muted-foreground'>
                  {new Intl.DateTimeFormat('uk-UA', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: 'Europe/Kyiv'
                  }).format(new Date(entry.createdAt))}{' '}
                  · {entry.actor.name}
                </p>
                {entry.note && <p className='break-words whitespace-pre-wrap'>{entry.note}</p>}
                {admin && entry.kind === 'payment' && !cancelled && !mode && (
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='self-start'
                    disabled={disabled}
                    onClick={() => start(entry.id)}
                  >
                    Скасувати платіж
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className='text-sm text-muted-foreground'>Оплат ще немає.</p>
      )}
    </section>
  );
}
