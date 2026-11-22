'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAppForm } from '@/lib/form';
import { Button } from '@/features/crm/components/action-button';
import { FieldGroup } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { CrmWorkspace, RepairOrder } from '@/features/crm/api/types';
import { crmQueries } from '@/features/crm/api/queries';
import { FormStatus, type FormState } from '@/features/crm/components/form-status';
import { money } from '@/features/crm/lib/format';
import { historyTimestamp } from '@/features/crm/lib/workflow-history';
import type { SettlementPayee } from '../api/types';
import { payeeKey, settlementBalance } from '../lib/settlements';
import { financeMutations } from '../api/finance-queries';
import { paymentSchema } from '@/features/crm/schemas/payment';
import { decimalScaled } from '@/features/inventory/schemas/inventory';
import CorrectionEditor from './correction-editor';

interface SettlementPanelProps {
  order: RepairOrder;
  data: CrmWorkspace;
  disabled?: boolean;
  onSaved: () => void;
  onStateChange?: (state: FormState) => void;
}
const labels = {
  accrual: 'Нарахування',
  adjustment: 'Коригування нарахування',
  payout: 'Виплата / аванс',
  return: 'Повернення коштів',
  reversal: 'Скасування помилкового запису'
};
export default function SettlementPanel({
  order,
  data,
  disabled,
  onSaved,
  onStateChange
}: SettlementPanelProps) {
  const finance = data.finance!;
  const access = data.access!;
  const admin = access.role === 'admin';
  const postings = finance.postings.filter((entry) => entry.orderId === order.id);
  const latest = postings.at(-1);
  const events = finance.events.filter((entry) => entry.orderId === order.id);
  const [mode, setMode] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [settingsRevision, setSettingsRevision] = useState(finance.settingsRevision);
  const client = useQueryClient();
  const feedback = {
    onSuccess: () => {
      toast.success('Фінансову операцію збережено');
      setMode(null);
      form.reset();
      setOperationId(crypto.randomUUID());
    },
    onSettled: () => client.invalidateQueries({ queryKey: crmQueries.all() })
  };
  const cash = useMutation({ ...financeMutations.cash(), ...feedback });
  const reverse = useMutation({ ...financeMutations.reversal(), ...feedback });
  const settings = useMutation({ ...financeMutations.settings(), ...feedback });
  const pending = cash.isPending || reverse.isPending || settings.isPending;
  useEffect(() => () => onStateChange?.({ dirty: false, pending: false }), [onStateChange]);
  const payees = new Map<string, SettlementPayee>();
  for (const entry of latest?.allocations ?? []) payees.set(payeeKey(entry.payee), entry.payee);
  for (const event of events) payees.set(payeeKey(event.payee), event.payee);
  for (const role of ['painter', 'polisher', 'assembler'] as const)
    if (order.economics?.[`${role}Id`]) {
      const payee: SettlementPayee = {
        kind: 'worker',
        id: order.economics[`${role}Id`],
        name: order.economics[`${role}Name`] || 'Працівник'
      };
      payees.set(payeeKey(payee), payee);
    }
  for (const line of order.economics?.lines ?? [])
    if (line.contractorId) {
      const payee: SettlementPayee = {
        kind: 'contractor',
        id: line.contractorId,
        name: line.contractorName
      };
      payees.set(payeeKey(payee), payee);
    }
  const options = new Map(payees);
  for (const member of data.team ?? []) {
    const payee: SettlementPayee = { kind: 'worker', id: member.id, name: member.name };
    options.set(payeeKey(payee), payee);
  }
  const form = useAppForm({
    defaultValues: {
      payeeKey: '',
      amount: '',
      note: '',
      share: String(finance.defaultShareBps / 100)
    },
    validators: {
      onSubmit: z.object({
        payeeKey:
          mode === 'payout' || mode === 'return'
            ? z.string().min(1, 'Виберіть одержувача')
            : z.string(),
        amount: mode === 'payout' || mode === 'return' ? paymentSchema.shape.amount : z.string(),
        note: mode?.startsWith('reverse:')
          ? z.string().trim().min(1, 'Вкажіть причину скасування').max(1000)
          : z.string().trim().max(1000),
        share:
          mode === 'settings'
            ? z
                .string()
                .trim()
                .regex(/^\d{1,3}([.,]\d{1,2})?$/, 'Ставка від 0 до 100%')
                .refine((value) => decimalScaled(value, 2) <= 10000, 'Ставка від 0 до 100%')
            : z.string()
      })
    },
    onSubmit: async ({ value }) => {
      if (!mode || disabled || pending) return;
      if (mode === 'settings')
        await settings
          .mutateAsync({
            orgId: access.orgId,
            employeeShareBps: decimalScaled(value.share, 2),
            expectedRevision: settingsRevision
          })
          .catch(() => undefined);
      else if (mode.startsWith('reverse:'))
        await reverse
          .mutateAsync({
            orgId: access.orgId,
            operationId,
            eventId: mode.slice(8),
            note: value.note
          })
          .catch(() => undefined);
      else {
        const payee = options.get(value.payeeKey);
        if (payee && (mode === 'payout' || mode === 'return'))
          await cash
            .mutateAsync({
              orgId: access.orgId,
              orderId: order.id,
              operationId,
              payeeKind: payee.kind,
              payeeId: payee.id,
              kind: mode,
              amount: value.amount,
              note: value.note
            })
            .catch(() => undefined);
      }
    }
  });
  function start(next: string | null): void {
    form.reset();
    if (next === 'settings') {
      setSettingsRevision(finance.settingsRevision);
      form.setFieldValue('share', String(finance.defaultShareBps / 100));
    }
    cash.reset();
    reverse.reset();
    settings.reset();
    setOperationId(crypto.randomUUID());
    setMode(next);
  }
  if (correcting)
    return (
      <CorrectionEditor
        order={order}
        data={data}
        onSaved={onSaved}
        onCancel={() => setCorrecting(false)}
        onStateChange={onStateChange}
      />
    );
  return (
    <section
      className='flex min-w-0 flex-col gap-3 border-t pt-3'
      aria-label='Нарахування та виплати'
    >
      <FormStatus dirty={!!mode} pending={pending} onChange={onStateChange} />
      <h4 className='font-semibold'>Нарахування та виплати</h4>
      <p className='text-muted-foreground text-sm'>
        {latest
          ? `Проведений розрахунок · версія ${latest.revision} · ${historyTimestamp(latest.createdAt)}`
          : 'Нарахування ще не проведені. Аванси можна записувати до готовності авто.'}
      </p>
      <p className='text-muted-foreground text-sm'>
        Баланс показано лише в межах цього замовлення. Аванси не переносяться на інші авто
        автоматично.
      </p>
      {[...payees.values()]
        .filter((payee) => admin || (payee.kind === 'worker' && payee.id === access.userId))
        .map((payee) => {
          const balance = settlementBalance(events, order.id, payee);
          return (
            <div
              key={payeeKey(payee)}
              className='flex flex-col gap-1 rounded-lg border p-3 text-sm'
            >
              <strong>{payee.name}</strong>
              <p>
                Нараховано: {money(balance.accruedCents)} · Виплачено: {money(balance.paidCents)}
              </p>
              <p>
                {balance.advanceCents > 0
                  ? `Аванс / переплата: ${money(balance.advanceCents)}`
                  : `До виплати: ${money(balance.payableCents)}`}
              </p>
            </div>
          );
        })}
      {admin && !mode && (
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='outline'
            disabled={disabled}
            onClick={() => start('payout')}
          >
            Записати виплату / аванс
          </Button>
          <Button
            type='button'
            variant='outline'
            disabled={disabled}
            onClick={() => start('return')}
          >
            Записати повернення від одержувача
          </Button>
          <Button
            type='button'
            variant='outline'
            disabled={disabled}
            onClick={() => start('settings')}
          >
            Ставка для нових замовлень
          </Button>
          {(latest || order.status === 'ready' || order.status === 'delivered') && (
            <Button
              type='button'
              variant='outline'
              disabled={disabled}
              onClick={() => setCorrecting(true)}
            >
              {latest ? 'Фінансове коригування' : 'Початковий розрахунок завершеного авто'}
            </Button>
          )}
        </div>
      )}
      {mode && admin && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <fieldset disabled={pending || disabled} className='min-w-0'>
            <FieldGroup>
              {mode === 'settings' ? (
                <form.AppField name='share'>
                  {(field) => (
                    <field.TextField
                      label='Загальна ставка для нових замовлень, %'
                      inputMode='decimal'
                      required
                      description='Чинні замовлення та проведені розрахунки не зміняться.'
                    />
                  )}
                </form.AppField>
              ) : mode.startsWith('reverse:') ? (
                <p className='text-sm'>
                  Скасування виправляє помилковий запис CRM. Для фактичного повернення грошей
                  використовуйте окрему операцію повернення.
                </p>
              ) : (
                <>
                  <form.AppField name='payeeKey'>
                    {(field) => (
                      <field.SelectField
                        label='Одержувач'
                        required
                        options={[...options.values()].map((payee) => ({
                          value: payeeKey(payee),
                          label: `${payee.name} · ${payee.kind === 'worker' ? 'Працівник' : 'Підрядник'}`
                        }))}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name='amount'>
                    {(field) => (
                      <field.TextField
                        label={
                          mode === 'return'
                            ? 'Сума повернення від одержувача, грн'
                            : 'Сума виплати / авансу, грн'
                        }
                        inputMode='decimal'
                        required
                      />
                    )}
                  </form.AppField>
                </>
              )}
              {mode !== 'settings' && (
                <form.AppField name='note'>
                  {(field) => (
                    <field.TextareaField
                      label={
                        mode.startsWith('reverse:')
                          ? 'Причина скасування виплати'
                          : 'Примітка до розрахунку'
                      }
                      required={mode.startsWith('reverse:')}
                    />
                  )}
                </form.AppField>
              )}
              {(cash.error || reverse.error || settings.error) && (
                <Alert variant='destructive'>
                  <AlertDescription>
                    {(cash.error || reverse.error || settings.error)!.message}
                  </AlertDescription>
                </Alert>
              )}
              <div className='flex flex-wrap gap-2'>
                <Button type='submit' isLoading={pending}>
                  Зберегти фінансову операцію
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  disabled={pending}
                  onClick={() => start(null)}
                >
                  Скасувати введення розрахунку
                </Button>
              </div>
            </FieldGroup>
          </fieldset>
        </form>
      )}
      <ol className='flex flex-col gap-2 text-sm' aria-label='Історія нарахувань та виплат'>
        {events.toReversed().map((event) => {
          const cancelled = events.some((entry) => entry.reversalOf === event.id);
          return (
            <li key={event.id} className='flex flex-col gap-1 rounded-lg border p-3'>
              <p>
                {labels[event.kind]} · {event.payee.name} · {money(event.amountCents)}
                {cancelled ? ' · Скасовано' : ''}
              </p>
              <p className='text-muted-foreground'>
                {historyTimestamp(event.createdAt)} · {event.actor.name}
              </p>
              {event.note && <p>{event.note}</p>}
              {admin &&
                !mode &&
                !cancelled &&
                (event.kind === 'payout' || event.kind === 'return') && (
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    className='self-start'
                    disabled={disabled}
                    onClick={() => start(`reverse:${event.id}`)}
                  >
                    Скасувати помилкову виплату / повернення
                  </Button>
                )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
