'use client';

import { Suspense, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { useAppForm } from '@/lib/form';
import { FieldGroup } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { CrmForm } from '@/features/crm/components/dialog-form';
import { FormActions, FormStatus, type FormState } from '@/features/crm/components/form-status';
import { teamMemberChoices } from '@/features/crm/lib/team-specialties';
import { crmQueries } from '@/features/crm/api/queries';
import type { CrmWorkspace, RepairOrder } from '@/features/crm/api/types';
import { inventoryQueries } from '@/features/inventory/api/queries';
import { orderMaterialCosts } from '@/features/inventory/lib/order-costs';
import { decimalScaled } from '@/features/inventory/schemas/inventory';
import { money } from '@/features/crm/lib/format';
import { laborMutations } from '../api/queries';
import { laborRoles, type OrderLabor as Labor } from '../api/types';
import { orderLabor, calculateRoleSalary } from '../lib/calculate';
import { laborFormSchema, orderLaborSchema } from '../schemas/labor';

const labels = { painter: 'Маляр', polisher: 'Полірувальник', assembler: 'Розбірник-збірник' };
function formValues(order: RepairOrder) {
  const labor = orderLabor(order);
  return {
    painter: {
      workerId: labor.painter.workerId,
      workerName: labor.painter.workerName,
      share: String(labor.painter.shareBps / 100)
    },
    polisher: {
      workerId: labor.polisher.workerId,
      workerName: labor.polisher.workerName,
      share: String(labor.polisher.shareBps / 100)
    },
    assembler: {
      workerId: labor.assembler.workerId,
      workerName: labor.assembler.workerName,
      share: String(labor.assembler.shareBps / 100)
    },
    polishing: String(labor.polishingCents / 100),
    assembly: String(labor.assemblyCents / 100),
    expectedRevision: order.workflowRevision ?? 0
  };
}
function toLabor(values: ReturnType<typeof formValues>): Labor {
  const parsed = laborFormSchema.parse(values);
  const assignment = (role: (typeof laborRoles)[number]) => ({
    workerId: parsed[role].workerId,
    workerName: parsed[role].workerName,
    shareBps: decimalScaled(parsed[role].share, 2)
  });
  return {
    painter: assignment('painter'),
    polisher: assignment('polisher'),
    assembler: assignment('assembler'),
    polishingCents: decimalScaled(parsed.polishing, 2),
    assemblyCents: decimalScaled(parsed.assembly, 2)
  };
}
function LaborForm({
  order,
  data,
  disabled,
  onStateChange
}: {
  order: RepairOrder;
  data: CrmWorkspace;
  disabled?: boolean;
  onStateChange: (state: FormState) => void;
}) {
  const access = data.access!;
  const { data: inventory } = useSuspenseQuery(
    inventoryQueries.order(access.userId, access.orgId, order.id)
  );
  const costs = orderMaterialCosts(inventory.movements, order.id);
  const client = useQueryClient();
  const defaults = useMemo(() => formValues(order), [order]);
  const [baseline, setBaseline] = useState(defaults);
  const [sourceOrder, setSourceOrder] = useState(order);
  const mutation = useMutation({
    ...laborMutations.save(),
    onSuccess: () => {
      toast.success('Умови нарахування збережено');
    },
    onSettled: () => client.invalidateQueries({ queryKey: crmQueries.all() })
  });
  const form = useAppForm({
    defaultValues: baseline,
    validators: { onSubmit: laborFormSchema },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync({
          orgId: access.orgId,
          orderId: order.id,
          operationId: crypto.randomUUID(),
          expectedRevision: value.expectedRevision,
          labor: orderLaborSchema.parse(toLabor(value))
        });
        const saved = { ...value, expectedRevision: value.expectedRevision + 1 };
        setBaseline(saved);
        form.reset(saved);
        onStateChange({ dirty: false, pending: false });
      } catch (error) {
        if (!mutation.error && error instanceof Error) toast.error(error.message);
      }
    }
  });
  if (order !== sourceOrder) {
    setSourceOrder(order);
    if (form.state.isDefaultValue && defaults.expectedRevision > baseline.expectedRevision)
      setBaseline(defaults);
  }
  useEffect(() => {
    form.reset(baseline);
  }, [baseline, form]);
  useEffect(() => () => onStateChange({ dirty: false, pending: false }), [onStateChange]);
  const values = useStore(form.store, (state) => state.values);
  let result: ReturnType<typeof calculateRoleSalary> | undefined;
  let issue = '';
  try {
    result = calculateRoleSalary(
      order.totalCents,
      costs,
      (order.expenses ?? []).reduce((sum, expense) => sum + expense.amountCents, 0),
      toLabor(values)
    );
  } catch (error) {
    issue =
      error instanceof z.ZodError
        ? (error.issues[0]?.message ?? 'Перевірте умови розрахунку')
        : error instanceof Error
          ? error.message
          : 'Перевірте умови розрахунку';
  }
  const admin = access.role === 'admin';
  return (
    <CrmForm
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Subscribe
        selector={(state) => ({ dirty: !state.isDefaultValue, pending: state.isSubmitting })}
      >
        {(state) => <FormStatus {...state} onChange={onStateChange} />}
      </form.Subscribe>
      <FieldGroup>
        <p className='text-muted-foreground text-sm'>
          {order.status === 'ready'
            ? 'Розрахунок за поточними умовами. Після збереження нарахування автоматично оновляться зі збереженням історії.'
            : 'Попередній розрахунок. Зарплата нарахується при переході у «Готово», незалежно від оплати клієнтом.'}
        </p>
        <fieldset
          disabled={!admin || disabled || mutation.isPending}
          className='flex min-w-0 flex-col gap-4'
        >
          {laborRoles.map((role) => (
            <fieldset key={role} className='flex min-w-0 flex-col gap-3 rounded-lg border p-4'>
              <legend className='px-1 text-sm font-semibold'>{labels[role]}</legend>
              <FieldGroup className='grid gap-3 sm:grid-cols-2'>
                <form.AppField name={`${role}.workerId`}>
                  {(field) => (
                    <field.ComboboxField
                      label={labels[role]}
                      required={
                        role === 'painter' ||
                        (role === 'polisher'
                          ? Number(values.polishing.replace(',', '.')) > 0
                          : Number(values.assembly.replace(',', '.')) > 0)
                      }
                      options={teamMemberChoices(
                        data.team ?? [],
                        values[role].workerId,
                        values[role].workerName
                      )}
                      searchPlaceholder='Ім’я або спеціалізація…'
                    />
                  )}
                </form.AppField>
                <form.AppField name={`${role}.share`}>
                  {(field) => (
                    <field.TextField
                      label={`Частка: ${labels[role]}, %`}
                      inputMode='decimal'
                      required
                    />
                  )}
                </form.AppField>
                {role !== 'painter' && (
                  <form.AppField name={role === 'polisher' ? 'polishing' : 'assembly'}>
                    {(field) => (
                      <field.TextField
                        label={
                          role === 'polisher'
                            ? 'Сума полірування, грн'
                            : 'Сума розбірки-збірки, грн'
                        }
                        description='Внутрішня частина загального чека. Не збільшує вартість замовлення.'
                        inputMode='decimal'
                        required
                      />
                    )}
                  </form.AppField>
                )}
              </FieldGroup>
              {role === 'painter' && (
                <p className='text-muted-foreground text-xs'>
                  Чек − матеріали фарбування − субпідряд − сума полірування − сума розбірки-збірки.
                </p>
              )}
              {role === 'polisher' && (
                <p className='text-muted-foreground text-xs'>
                  Сума полірування − матеріали полірування.
                </p>
              )}
              {role === 'assembler' && (
                <p className='text-muted-foreground text-xs'>Відсоток від суми розбірки-збірки.</p>
              )}
              {result && (
                <p className='text-sm tabular-nums'>
                  База: {money(result[`${role}BaseCents`])} × {values[role].share}% ={' '}
                  <strong>{money(result[`${role}AccrualCents`])}</strong>
                </p>
              )}
            </fieldset>
          ))}
        </fieldset>
        {issue && (
          <Alert variant='destructive'>
            <AlertDescription>{issue}</AlertDescription>
          </Alert>
        )}
        {result && (
          <section
            aria-label='Результат розрахунку'
            className='flex flex-col gap-2 rounded-lg bg-muted p-4 text-sm'
          >
            <p>
              Зарплати працівників: <strong>{money(result.employeeAccrualsCents)}</strong>
            </p>
            <p>
              Залишок малярці: <strong>{money(result.workshopRemainderCents)}</strong>
            </p>
            <p className='text-muted-foreground'>
              До загальних витрат бізнесу. Матеріали й субпідряд враховані один раз.
            </p>
          </section>
        )}
        {admin && (
          <FormActions
            pending={mutation.isPending}
            error={mutation.error}
            disabled={disabled || !!issue}
            label='Зберегти умови нарахування'
          />
        )}
      </FieldGroup>
    </CrmForm>
  );
}
export function OrderLabor(props: {
  order: RepairOrder;
  data: CrmWorkspace;
  disabled?: boolean;
  onStateChange: (state: FormState) => void;
}): ReactElement {
  return (
    <Suspense fallback={<Skeleton className='h-48 w-full' />}>
      <LaborForm {...props} />
    </Suspense>
  );
}
