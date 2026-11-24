'use client';

import { useState, useEffect } from 'react';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/features/crm/components/action-button';
import { Icons } from '@/components/icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FieldGroup } from '@/components/ui/field';
import { useAppForm } from '@/lib/form';
import { CrmForm } from '@/features/crm/components/dialog-form';
import { FormStatus, FormActions, type FormState } from '@/features/crm/components/form-status';
import type { CrmWorkspace, RepairOrder } from '@/features/crm/api/types';
import { crmQueries } from '@/features/crm/api/queries';
import { money } from '@/features/crm/lib/format';
import { expenseMutations } from '../api/queries';
import type { OrderExpense } from '../api/types';
import { legacyExpenseName, defaultExpenseNames } from '../lib/names';
import { orderExpenseSchema } from '../schemas/expenses';

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
          <div className='min-w-0 basis-full sm:flex-1 sm:basis-auto'>
            <p className='break-words font-medium'>
              {expense.expenseName ?? legacyExpenseName(expense.kind)}
            </p>
            <p className='text-muted-foreground text-sm break-words'>{expense.contractorName}</p>
            {expense.note && (
              <p className='text-muted-foreground text-sm whitespace-pre-wrap break-words'>
                {expense.note}
              </p>
            )}
          </div>
          <strong className='text-sm tabular-nums'>{money(expense.amountCents)}</strong>
          {data.access?.role === 'admin' && (
            <div className='flex items-center gap-1'>
              <Button
                type='button'
                size='icon'
                variant='ghost'
                aria-label={`Редагувати витрату: ${expense.expenseName ?? legacyExpenseName(expense.kind)}`}
                disabled={disabled || !!editing || remove.isPending}
                onClick={() => setEditing(expense)}
              >
                <Icons.edit />
              </Button>
              <Button
                type='button'
                size='icon'
                variant='ghost'
                aria-label={`Видалити витрату: ${expense.expenseName ?? legacyExpenseName(expense.kind)}`}
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
          data={data}
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
  data,
  expense,
  disabled,
  onStateChange,
  onSaved
}: {
  order: RepairOrder;
  orgId: string;
  data: CrmWorkspace;
  expense?: OrderExpense;
  disabled?: boolean;
  onStateChange: (state: FormState) => void;
  onSaved: () => void;
}) {
  const client = useQueryClient();
  const [addingName, setAddingName] = useState(false);
  const createName = useMutation({
    ...expenseMutations.createName(),
    onError: (error) => toast.error(error.message),
    onSettled: () => client.invalidateQueries({ queryKey: crmQueries.all() })
  });
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
        expenseNameId: expense?.expenseNameId ?? '',
        contractorUserId: expense?.contractorUserId ?? '',
        note: expense?.note ?? '',
        amount: expense ? String(expense.amountCents / 100) : ''
      },
      newExpenseName: ''
    },
    validators: { onSubmit: z.object({ expense: orderExpenseSchema, newExpenseName: z.string() }) },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value.expense).catch(() => undefined);
    }
  });
  async function addName(): Promise<void> {
    try {
      const entry = await createName.mutateAsync({
        orgId,
        name: form.getFieldValue('newExpenseName')
      });
      form.setFieldValue('expense.expenseNameId', entry.id);
      form.setFieldValue('newExpenseName', '');
      setAddingName(false);
    } catch {
      /* Keep the name draft for correction or retry. */
    }
  }
  const names = data.expenseNames ?? defaultExpenseNames;
  const members = [
    ...(data.team ?? []).map((member) => ({ value: member.id, label: member.name })),
    ...(expense?.contractorUserId &&
    !data.team?.some((member) => member.id === expense.contractorUserId)
      ? [{ value: expense.contractorUserId, label: expense.contractorName, disabled: true }]
      : [])
  ];
  return (
    <CrmForm
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.Subscribe
        selector={(state) => ({
          dirty: !state.isDefaultValue,
          pending: state.isSubmitting || createName.isPending
        })}
      >
        {(state) => <FormStatus {...state} onChange={onStateChange} />}
      </form.Subscribe>
      <fieldset
        disabled={disabled || mutation.isPending || createName.isPending}
        className='min-w-0'
      >
        <FieldGroup>
          <form.AppField name='expense.expenseNameId'>
            {(field) => (
              <field.ComboboxField
                label='Назва витрати'
                required
                clearable={false}
                options={names.map((entry) => ({ value: entry.id, label: entry.name }))}
                placeholder='Виберіть назву витрати'
                searchPlaceholder='Пошук назви витрати…'
              />
            )}
          </form.AppField>
          {!addingName ? (
            <Button
              type='button'
              variant='outline'
              className='self-start'
              onClick={() => setAddingName(true)}
            >
              <Icons.add />
              Нова назва витрати
            </Button>
          ) : (
            <div className='flex flex-col gap-3 rounded-lg border p-3'>
              <form.AppField name='newExpenseName'>
                {(field) => (
                  <field.TextField
                    label='Нова назва витрати'
                    maxLength={120}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void addName();
                      }
                    }}
                  />
                )}
              </form.AppField>
              {createName.error && (
                <Alert variant='destructive'>
                  <AlertDescription>{createName.error.message}</AlertDescription>
                </Alert>
              )}
              <div className='flex flex-wrap items-center gap-2'>
                <Button
                  type='button'
                  isLoading={createName.isPending}
                  onClick={() => void addName()}
                >
                  Додати назву
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  onClick={() => {
                    setAddingName(false);
                    form.setFieldValue('newExpenseName', '');
                  }}
                >
                  Скасувати додавання назви
                </Button>
              </div>
            </div>
          )}
          <form.AppField name='expense.contractorUserId'>
            {(field) => (
              <field.ComboboxField
                label='Субпідрядник'
                required
                clearable={false}
                options={members}
                placeholder='Виберіть учасника команди'
                searchPlaceholder='Пошук учасника…'
                emptyMessage='Додайте учасника в розділі «Команда».'
                description='У «Зарплатах» ці суми з’являться лише після ввімкнення відповідного налаштування учасника.'
              />
            )}
          </form.AppField>
          <form.AppField name='expense.note'>
            {(field) => <field.TextareaField label='Примітка' maxLength={1000} />}
          </form.AppField>
          <form.AppField name='expense.amount'>
            {(field) => (
              <field.TextField label='Вартість субпідряду, грн' inputMode='decimal' required />
            )}
          </form.AppField>
          <FormActions
            pending={mutation.isPending || createName.isPending}
            error={mutation.error}
            disabled={disabled || addingName}
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
