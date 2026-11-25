'use client';

import { useEffect, useRef, useState, useId, type ReactElement } from 'react';
import { useStore } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppForm } from '@/lib/form';
import { useDebounce } from '@/hooks/use-debounce';
import { useDialogPresence } from '@/hooks/use-dialog-presence';
import { InputGroup, InputGroupInput, InputGroupAddon } from '@/components/ui/input-group';
import { Field, FieldGroup, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/features/crm/components/action-button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { OrderOperationDialog } from '@/features/crm/components/order-operation-dialog';
import { CrmForm, DialogActions } from '@/features/crm/components/dialog-form';
import { FormStatus, type FormState } from '@/features/crm/components/form-status';
import { crmQueries } from '@/features/crm/api/queries';
import type { CrmAccess } from '@/features/crm/api/types';
import { money } from '@/features/crm/lib/format';
import { roundedRatio } from '@/features/order-economics/lib/integers';
import { consumeValuedStock } from '@/features/order-economics/lib/stock-valuation';
import { inventoryMutations, inventoryQueries } from '../api/queries';
import type { StockItem, StockMovement } from '../api/types';
import { consumptionSchema, quantityMilli, materialAmountCents } from '../schemas/inventory';
import { stockQuantity } from '../lib/format';

function materialChoice(entry: StockItem, movement?: StockMovement) {
  return {
    value: entry.id,
    label: entry.name,
    description:
      entry.accountingMode === 'amount'
        ? 'За сумою · без контролю залишку'
        : `${stockQuantity(entry.balanceMilli)} ${entry.unit} · ${entry.totalCostCents === null ? 'Потрібно визначити собівартість' : entry.balanceMilli > 0 ? `${money(roundedRatio(BigInt(entry.totalCostCents) * BigInt(1000), BigInt(entry.balanceMilli)))}/${entry.unit}` : 'Залишок вичерпано'}`,
    disabled:
      entry.archived ||
      (entry.accountingMode !== 'amount' &&
        entry.balanceMilli <= 0 &&
        entry.id !== movement?.itemId) ||
      (entry.accountingMode !== 'amount' &&
        entry.totalCostCents === null &&
        entry.id !== movement?.itemId)
  };
}

export function ConsumptionDialog({
  orderId,
  access,
  movement,
  items,
  onClose: onClosed,
  onStateChange
}: {
  orderId: string;
  access: CrmAccess;
  movement?: StockMovement;
  items: StockItem[];
  onClose: () => void;
  onStateChange?: (state: FormState) => void;
}): ReactElement {
  const presence = useDialogPresence(onClosed);
  const onClose = presence.close;
  const formId = useId();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);
  const candidates = useQuery(
    inventoryQueries.items(access.userId, access.orgId, {
      search: debounced,
      tags: [],
      archived: false,
      pageSize: 50
    })
  );
  const [knownItems, setKnownItems] = useState(items);
  const quantityRef = useRef<HTMLInputElement>(null);
  const quantityId = useId();
  const purposeId = useId();
  const [operationId] = useState(() => crypto.randomUUID());
  const client = useQueryClient();
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: inventoryQueries.all() }),
      client.invalidateQueries({ queryKey: crmQueries.all() })
    ]);
  const mutation = useMutation({
    ...inventoryMutations.saveConsumption(access.orgId, movement?.id),
    onSuccess: () => {
      toast.success(movement ? 'Списання оновлено' : 'Матеріал списано');
    },
    onSettled: refresh
  });
  const reversal = useMutation({
    ...inventoryMutations.reverse(access.orgId),
    onSuccess: () =>
      toast.success(
        movement?.accountingMode === 'amount'
          ? 'Витрату скасовано.'
          : 'Списання скасовано. Матеріал повернуто на склад.'
      ),
    onSettled: refresh
  });
  const form = useAppForm({
    defaultValues: {
      operationId,
      orderId,
      itemId: movement?.itemId ?? '',
      quantity:
        movement && movement.accountingMode !== 'amount' ? String(-movement.deltaMilli / 1000) : '',
      amount:
        movement?.accountingMode === 'amount' && movement.costDeltaCents !== null
          ? String(-movement.costDeltaCents / 100)
          : '',
      category: movement?.category ?? ('painting' as 'painting' | 'polishing'),
      note: movement?.note ?? ''
    },
    validators: {
      onSubmit: consumptionSchema.safeExtend({
        amount: consumptionSchema.shape.amount.unwrap(),
        category: consumptionSchema.shape.category.removeDefault()
      })
    },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(value);
        onClose();
      } catch {
        /* Keep the draft for retry. */
      }
    }
  });
  const values = useStore(form.store, (state) => state.values);
  const item =
    candidates.data?.items.find((entry) => entry.id === values.itemId) ??
    knownItems.find((entry) => entry.id === values.itemId);
  const amountOnly = item?.accountingMode === 'amount';
  const available =
    (item?.balanceMilli ?? 0) + (movement?.itemId === values.itemId ? -movement.deltaMilli : 0);
  const validQuantity = /^\d{1,6}([.,]\d{1,3})?$/.test(values.quantity);
  const quantity = validQuantity ? quantityMilli(values.quantity) : 0;
  const exceeds = !amountOnly && !!item && quantity > available;
  let cost: number | null = null;
  if (amountOnly) cost = materialAmountCents(values.amount);
  else if (item && quantity > 0 && !exceeds) {
    if (movement?.itemId === item.id && movement.costDeltaCents !== null) {
      const oldQuantity = -movement.deltaMilli;
      if (quantity <= oldQuantity)
        cost = roundedRatio(
          BigInt(-movement.costDeltaCents) * BigInt(quantity),
          BigInt(oldQuantity)
        );
      else if (item.totalCostCents !== null)
        cost =
          -movement.costDeltaCents +
          consumeValuedStock(
            { quantityMilli: item.balanceMilli, totalCostCents: item.totalCostCents },
            quantity - oldQuantity
          ).costCents;
    } else if (
      item.totalCostCents !== null &&
      !(movement?.itemId === item.id && movement.costDeltaCents === null)
    )
      cost = consumeValuedStock(
        { quantityMilli: item.balanceMilli, totalCostCents: item.totalCostCents },
        quantity
      ).costCents;
  }
  const options = [
    ...new Map(
      [
        ...knownItems.filter((entry) => entry.id === values.itemId && !debounced.trim()),
        ...(candidates.data?.items ?? [])
      ].map((entry) => [entry.id, entry])
    ).values()
  ].map((entry) => materialChoice(entry, movement));

  const pending = mutation.isPending || reversal.isPending;
  useEffect(() => () => onStateChange?.({ dirty: false, pending: false }), [onStateChange]);
  return (
    <OrderOperationDialog
      open={presence.open}
      onOpenChangeComplete={presence.onOpenChangeComplete}
      formId={formId}
      title={movement ? 'Редагувати списання' : 'Нове списання'}
      description='Операція одразу зберігається на складі та в замовленні.'
      pending={pending}
      onClose={onClose}
    >
      <CrmForm
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <form.Subscribe
          selector={(state) => ({
            dirty: !state.isDefaultValue,
            pending: state.isSubmitting || reversal.isPending
          })}
        >
          {(state) => <FormStatus {...state} onChange={onStateChange} />}
        </form.Subscribe>
        <fieldset disabled={pending} className='min-w-0'>
          <FieldGroup>
            <form.AppField name='itemId'>
              {(field) => (
                <field.ComboboxField
                  label='Матеріал зі складу'
                  required
                  clearable={false}
                  options={options}
                  selectedOption={item ? materialChoice(item, movement) : undefined}
                  onSearchChange={setSearch}
                  onOptionChange={(option) => {
                    const selected = candidates.data?.items.find(
                      (entry) => entry.id === option?.value
                    );
                    if (selected)
                      setKnownItems((current) => [
                        ...current.filter((entry) => entry.id !== selected.id),
                        selected
                      ]);
                    form.setFieldValue('quantity', '');
                    form.setFieldValue('amount', '');
                    requestAnimationFrame(() => quantityRef.current?.focus());
                  }}
                  renderValue={(option) => (
                    <span className='flex min-w-0 items-center gap-3'>
                      <span className='flex min-w-0 flex-1 flex-col gap-1'>
                        <span className='truncate font-medium'>{option.label}</span>
                        <span className='truncate text-xs text-muted-foreground'>
                          {option.description}
                        </span>
                      </span>
                      <span className='shrink-0 text-xs text-primary'>Змінити</span>
                    </span>
                  )}
                  loading={candidates.isFetching}
                  errorMessage={candidates.isError ? 'Не вдалося завантажити матеріали' : undefined}
                  onRetry={() => void candidates.refetch()}
                  placeholder='Виберіть матеріал'
                  searchPlaceholder='Назва матеріалу…'
                />
              )}
            </form.AppField>
            {amountOnly ? (
              <form.Field name='amount'>
                {(field) => (
                  <Field data-invalid={field.state.meta.errors.length > 0}>
                    <FieldLabel htmlFor={quantityId}>Сума витрати, грн *</FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id={quantityId}
                        ref={quantityRef}
                        name={field.name}
                        inputMode='decimal'
                        placeholder='3500,00'
                        required
                        value={field.state.value}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                        aria-invalid={field.state.meta.errors.length > 0}
                        aria-describedby={`${quantityId}-help`}
                      />
                      <InputGroupAddon align='inline-end'>грн</InputGroupAddon>
                    </InputGroup>
                    <FieldDescription id={`${quantityId}-help`}>
                      Внутрішня вартість матеріалу для цього авто. Кількість і залишок не
                      обліковуються.
                    </FieldDescription>
                    <FieldError errors={field.state.meta.errors} />
                  </Field>
                )}
              </form.Field>
            ) : (
              <>
                <div className='grid gap-4 sm:grid-cols-2'>
                  <form.Field name='quantity'>
                    {(field) => (
                      <Field data-invalid={exceeds || field.state.meta.errors.length > 0}>
                        <FieldLabel htmlFor={quantityId}>Кількість *</FieldLabel>
                        <InputGroup>
                          <InputGroupInput
                            id={quantityId}
                            ref={quantityRef}
                            name={field.name}
                            inputMode='decimal'
                            placeholder='0'
                            disabled={!item}
                            required
                            value={field.state.value}
                            onChange={(event) => field.handleChange(event.target.value)}
                            onBlur={field.handleBlur}
                            aria-invalid={exceeds || field.state.meta.errors.length > 0}
                            aria-describedby={`${quantityId}-help`}
                          />
                          <InputGroupAddon align='inline-end'>{item?.unit ?? '—'}</InputGroupAddon>
                        </InputGroup>
                        <FieldDescription id={`${quantityId}-help`}>
                          {item
                            ? `Доступно ${stockQuantity(available)} ${item.unit}`
                            : 'Спочатку виберіть матеріал'}
                        </FieldDescription>
                        {exceeds && (
                          <p role='alert' className='text-destructive text-sm'>
                            Кількість перевищує доступний залишок.
                          </p>
                        )}
                        <FieldError errors={field.state.meta.errors} />
                      </Field>
                    )}
                  </form.Field>
                  <section aria-label='Собівартість списання' className='flex flex-col gap-2'>
                    <p className='text-sm font-medium'>Собівартість</p>
                    <strong className='text-xl leading-9 tabular-nums'>
                      {cost === null ? '—' : money(cost)}
                    </strong>
                    {item && (
                      <p className='text-xs text-muted-foreground'>
                        Розраховується зі складської собівартості
                      </p>
                    )}
                  </section>
                </div>
              </>
            )}
            <form.Field name='category'>
              {(field) => (
                <Field data-invalid={field.state.meta.errors.length > 0}>
                  <FieldLabel id={purposeId}>Призначення</FieldLabel>
                  <ToggleGroup
                    aria-labelledby={purposeId}
                    value={[field.state.value]}
                    onValueChange={(value) => {
                      if (value[0] === 'painting' || value[0] === 'polishing')
                        field.handleChange(value[0]);
                    }}
                    variant='outline'
                    className='w-full [&_button]:min-h-10'
                  >
                    <ToggleGroupItem value='painting' className='flex-1'>
                      Фарбування
                    </ToggleGroupItem>
                    <ToggleGroupItem value='polishing' className='flex-1'>
                      Полірування
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <FieldDescription>
                    Для конкретного списання; не залежить від тегів матеріалу.
                  </FieldDescription>
                  <FieldError errors={field.state.meta.errors} />
                </Field>
              )}
            </form.Field>
            <form.AppField name='note'>
              {(field) => <field.TextareaField label='Примітка' maxLength={1000} />}
            </form.AppField>
            {(mutation.error || reversal.error) && (
              <Alert variant='destructive'>
                <AlertDescription>
                  {mutation.error?.message ?? reversal.error?.message}
                </AlertDescription>
              </Alert>
            )}
            <DialogActions>
              {movement && (
                <Button
                  type='button'
                  variant='destructive'
                  className='sm:mr-auto'
                  disabled={pending}
                  isLoading={reversal.isPending}
                  onClick={async () => {
                    try {
                      await reversal.mutateAsync({
                        movementId: movement.id,
                        operationId,
                        note: 'Скасування списання адміністратором'
                      });
                      onClose();
                    } catch {
                      /* Preserve dialog on error. */
                    }
                  }}
                >
                  Скасувати списання
                </Button>
              )}
              <Button type='button' variant='outline' disabled={pending} onClick={onClose}>
                Скасувати
              </Button>
              <Button
                type='submit'
                form={formId}
                isLoading={mutation.isPending}
                disabled={
                  pending || !item || (!amountOnly && quantity <= 0) || exceeds || cost === null
                }
              >
                {movement ? 'Зберегти списання' : 'Списати'}
              </Button>
            </DialogActions>
          </FieldGroup>
        </fieldset>
      </CrmForm>
    </OrderOperationDialog>
  );
}
