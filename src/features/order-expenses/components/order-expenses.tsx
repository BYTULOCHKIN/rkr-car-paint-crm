'use client';

import { useState, useEffect } from 'react';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { FieldGroup } from '@/components/ui/field';
import { useAppForm } from '@/lib/form';
import { CrmForm } from '@/features/crm/components/dialog-form';
import { FormStatus, FormActions, type FormState } from '@/features/crm/components/form-status';
import type { CrmWorkspace, RepairOrder } from '@/features/crm/api/types';
import { crmQueries } from '@/features/crm/api/queries';
import { money } from '@/features/crm/lib/format';
import { expenseMutations } from '../api/queries';
import type { OrderExpense, OrderExpenseKind } from '../api/types';
import { orderExpenseSchema } from '../schemas/expenses';

const kinds = [
  { value: 'color_matching', label: 'Підбір фарби' },
  { value: 'soldering', label: 'Пайка' },
  { value: 'other', label: 'Інший субпідряд' }
];
interface OrderExpensesProps {
  order: RepairOrder;
  data: CrmWorkspace;
  disabled?: boolean;
  onStateChange: (state: FormState) => void;
}
export function OrderExpenses({ order, data, disabled, onStateChange }: OrderExpensesProps) {
  const [editing, setEditing] = useState<OrderExpense | 'new' | null>(null);
  const client = useQueryClient();
  const remove = useMutation({
    ...expenseMutations.remove(),
    onSuccess: () => toast.success('Витрату видалено'),
    onError: (error) => toast.error(error.message),
    onSettled: () => client.invalidateQueries({ queryKey: crmQueries.all() })
  });
  const [formState, setFormState] = useState<FormState>({ dirty: false, pending: false });
  useEffect(() => {
    onStateChange({ dirty: formState.dirty, pending: formState.pending || remove.isPending });
  }, [formState, remove.isPending, onStateChange]);
  const expenses = order.expenses ?? [];
  return (
    <section
      className='flex flex-col gap-3 rounded-lg border p-4'
      aria-label='Витрати на субпідряд'
    >
      <h3 className='font-semibold'>Субпідряд</h3>
      <p className='text-muted-foreground text-sm'>
        Внутрішні витрати на підбір фарби, пайку та інші послуги. Віднімаються перед розрахунком
        зарплати й не потрапляють у клієнтський чек.
      </p>
      <p className='text-sm'>
        Разом:{' '}
        <strong>{money(expenses.reduce((sum, expense) => sum + expense.amountCents, 0))}</strong>
      </p>
      {!expenses.length && (
        <p className='text-muted-foreground text-sm'>Витрат на субпідряд ще немає.</p>
      )}
      {expenses.map((expense) => (
        <div
          key={expense.id}
          className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3'
        >
          <div className='min-w-0 flex-1'>
            <p className='break-words font-medium'>{expense.description}</p>
            <p className='text-muted-foreground text-sm break-words'>
              {expense.contractorName} · {kinds.find((kind) => kind.value === expense.kind)?.label}
            </p>
          </div>
          <strong className='text-sm tabular-nums'>{money(expense.amountCents)}</strong>
          {data.access?.role === 'admin' && (
            <div className='flex items-center gap-1'>
              <Button
                type='button'
                size='icon'
                variant='ghost'
                aria-label={`Редагувати витрату: ${expense.description}`}
                disabled={disabled || !!editing || remove.isPending}
                onClick={() => setEditing(expense)}
              >
                <Icons.edit />
              </Button>
              <Button
                type='button'
                size='icon'
                variant='ghost'
                aria-label={`Видалити витрату: ${expense.description}`}
                disabled={disabled || !!editing || remove.isPending}
                onClick={() =>
                  remove.mutate({
                    orgId: data.access!.orgId,
                    orderId: order.id,
                    expectedRevision: order.workflowRevision ?? 0,
                    operationId: crypto.randomUUID(),
                    id: expense.id
                  })
                }
              >
                <Icons.trash />
              </Button>
            </div>
          )}
        </div>
      ))}
      {data.access?.role === 'admin' && !editing && (
        <Button
          type='button'
          variant='outline'
          className='self-start'
          disabled={disabled || remove.isPending}
          onClick={() => setEditing('new')}
        >
          <Icons.add />
          Додати витрату
        </Button>
      )}
      {editing && (
        <ExpenseForm
          key={typeof editing === 'string' ? editing : editing.id}
          order={order}
          orgId={data.access!.orgId}
          expense={editing === 'new' ? undefined : editing}
          disabled={disabled}
          onStateChange={setFormState}
          onSaved={() => setEditing(null)}
        />
      )}
    </section>
  );
}
function ExpenseForm({
  order,
  orgId,
  expense,
  disabled,
  onStateChange,
  onSaved
}: {
  order: RepairOrder;
  orgId: string;
  expense?: OrderExpense;
  disabled?: boolean;
  onStateChange: (state: FormState) => void;
  onSaved: () => void;
}) {
  const client = useQueryClient();
  const [operationId] = useState(() => crypto.randomUUID());
  const mutation = useMutation({
    ...expenseMutations.save(),
    onSuccess: () => {
      toast.success('Витрату збережено');
      onStateChange({ dirty: false, pending: false });
      onSaved();
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => client.invalidateQueries({ queryKey: crmQueries.all() })
  });
  const form = useAppForm({
    defaultValues: {
      expense: {
        orgId,
        orderId: order.id,
        operationId,
        expectedRevision: order.workflowRevision ?? 0,
        ...(expense ? { id: expense.id } : {}),
        kind: expense?.kind ?? ('other' as OrderExpenseKind),
        description: expense?.description ?? '',
        contractorName: expense?.contractorName ?? '',
        amount: expense ? String(expense.amountCents / 100) : ''
      }
    },
    validators: { onSubmit: z.object({ expense: orderExpenseSchema }) },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value.expense).catch(() => undefined);
    }
  });
  return (
    <CrmForm
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Subscribe
        selector={(state) => ({ dirty: !state.isDefaultValue, pending: state.isSubmitting })}
      >
        {(state) => <FormStatus {...state} onChange={onStateChange} />}
      </form.Subscribe>
      <fieldset disabled={disabled || mutation.isPending} className='min-w-0'>
        <FieldGroup>
          <form.AppField name='expense.kind'>
            {(field) => <field.SelectField label='Вид витрати' options={kinds} />}
          </form.AppField>
          <form.AppField name='expense.description'>
            {(field) => <field.TextField label='Назва витрати' required />}
          </form.AppField>
          <form.AppField name='expense.contractorName'>
            {(field) => <field.TextField label='Субпідрядник' required />}
          </form.AppField>
          <form.AppField name='expense.amount'>
            {(field) => (
              <field.TextField label='Вартість субпідряду, грн' inputMode='decimal' required />
            )}
          </form.AppField>
          <FormActions
            pending={mutation.isPending}
            error={mutation.error}
            disabled={disabled}
            label='Зберегти витрату'
            onCancel={() => {
              onStateChange({ dirty: false, pending: false });
              onSaved();
            }}
          />
        </FieldGroup>
      </fieldset>
    </CrmForm>
  );
}
