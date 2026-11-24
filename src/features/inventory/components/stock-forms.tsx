'use client';

import { useState, useEffect, useId } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppForm } from '@/lib/form';
import { FieldGroup } from '@/components/ui/field';
import { Button } from '@/features/crm/components/action-button';
import type { StockItem, StockMovement } from '../api/types';
import { inventoryMutations, inventoryQueries } from '../api/queries';
import { crmQueries } from '@/features/crm/api/queries';
import {
  itemSchema,
  updateItemSchema,
  stockUnitSchema,
  receiptSchema,
  adjustmentSchema,
  consumptionSchema,
  reversalSchema,
  valuationSchema
} from '../schemas/inventory';
import { stockQuantity, materialCategoryOptions } from '../lib/format';
import { FormStatus, type FormState } from '@/features/crm/components/form-status';
import { DialogActions } from '@/features/crm/components/dialog-form';
import { stockUnitOptions } from '../constants/units';
import type { StockTag } from '../constants/tags';
import { StockTagsField } from './stock-tags-field';

function useFeedback(onSaved: () => void) {
  const client = useQueryClient();
  return {
    onSuccess: () => {
      toast.success('Збережено');
      onSaved();
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: inventoryQueries.all() }),
        client.invalidateQueries({ queryKey: crmQueries.all() })
      ])
  };
}

function FormError({ error }: { error: Error | null }) {
  return error ? (
    <p role='alert' className='text-destructive text-sm'>
      {error.message}
    </p>
  ) : null;
}

function usePending(pending: boolean, onPendingChange?: (pending: boolean) => void) {
  useEffect(() => {
    onPendingChange?.(pending);
    return () => onPendingChange?.(false);
  }, [pending, onPendingChange]);
}

export function StockItemForm({
  orgId,
  item,
  onSaved,
  onPendingChange
}: {
  orgId: string;
  item?: StockItem;
  onSaved: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const create = useMutation({ ...inventoryMutations.create(orgId), ...useFeedback(onSaved) });
  const update = useMutation({ ...inventoryMutations.update(orgId), ...useFeedback(onSaved) });
  const pending = create.isPending || update.isPending;
  usePending(create.isPending || update.isPending, onPendingChange);
  const form = useAppForm({
    defaultValues: {
      name: item?.name ?? '',
      unit: item?.unit ?? 'шт',
      notes: item?.notes ?? '',
      tags: item?.tags ?? (['Розхідник'] as StockTag[])
    },
    validators: {
      onSubmit: updateItemSchema
        .omit({ id: true })
        .required({ tags: true })
        .refine((value) => item?.locked || stockUnitSchema.safeParse(value.unit).success, {
          path: ['unit'],
          message: 'Оберіть одиницю: шт, л, кг або м'
        })
    },
    onSubmit: async ({ value }) => {
      if (item) await update.mutateAsync({ ...value, id: item.id }).catch(() => undefined);
      else await create.mutateAsync(itemSchema.parse(value)).catch(() => undefined);
    }
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <fieldset disabled={pending} className='min-w-0'>
        <FieldGroup>
          <form.AppField name='name'>
            {(field) => (
              <field.TextField
                label='Назва позиції'
                required
                disabled={item?.locked}
                maxLength={120}
              />
            )}
          </form.AppField>
          <form.AppField name='unit'>
            {(field) => (
              <field.SelectField
                label='Одиниця виміру'
                required
                disabled={item?.locked}
                options={
                  item?.locked && !stockUnitOptions.some((option) => option.value === item.unit)
                    ? [...stockUnitOptions, { value: item.unit, label: item.unit, disabled: true }]
                    : stockUnitOptions
                }
                description='Оберіть: шт, л, кг або м.'
              />
            )}
          </form.AppField>
          {item?.locked && (
            <p className='text-muted-foreground text-sm'>
              Назва й одиниця зафіксовані після першої операції.
            </p>
          )}
          <form.AppField name='tags' mode='array'>
            {() => <StockTagsField disabled={pending} />}
          </form.AppField>
          <form.AppField name='notes'>
            {(field) => <field.TextareaField label='Примітка' />}
          </form.AppField>
          <FormError error={create.error ?? update.error} />
          <Button type='submit' isLoading={pending}>
            {item ? 'Зберегти позицію' : 'Створити позицію'}
          </Button>
        </FieldGroup>
      </fieldset>
    </form>
  );
}

export function StockOperationForm({
  orgId,
  kind,
  item,
  items = [],
  orderId,
  onSaved,
  onPendingChange
}: {
  orgId: string;
  kind: 'receipt' | 'adjustment' | 'consumption';
  item?: StockItem;
  items?: StockItem[];
  orderId?: string;
  onSaved: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [operationId] = useState(() => crypto.randomUUID());
  const receive = useMutation({ ...inventoryMutations.receive(orgId), ...useFeedback(onSaved) });
  const adjust = useMutation({ ...inventoryMutations.adjust(orgId), ...useFeedback(onSaved) });
  const consume = useMutation({ ...inventoryMutations.consume(orgId), ...useFeedback(onSaved) });
  const mutation = kind === 'receipt' ? receive : kind === 'adjustment' ? adjust : consume;
  usePending(mutation.isPending, onPendingChange);
  const schema =
    kind === 'receipt'
      ? receiptSchema
      : kind === 'adjustment'
        ? adjustmentSchema
        : consumptionSchema.omit({ orderId: true });
  const payload = (value: {
    itemId: string;
    operationId: string;
    quantity: string;
    note: string;
    totalAmount: string;
    currency: 'UAH' | 'EUR';
    exchangeRate: string;
    category: 'painting' | 'polishing';
  }) => {
    const base = {
      itemId: value.itemId,
      operationId: value.operationId,
      quantity: value.quantity,
      note: value.note
    };
    if (kind === 'consumption') return { ...base, category: value.category };
    if (kind === 'adjustment' && value.quantity.startsWith('-')) return base;
    return {
      ...base,
      totalAmount: value.totalAmount,
      currency: value.currency,
      exchangeRate: value.currency === 'UAH' ? '1' : value.exchangeRate
    };
  };
  const form = useAppForm({
    defaultValues: {
      itemId: item?.id ?? '',
      operationId,
      quantity: '',
      note: '',
      totalAmount: '',
      currency: 'UAH' as 'UAH' | 'EUR',
      exchangeRate: '',
      category: 'painting' as 'painting' | 'polishing'
    },
    validators: {
      onSubmit: ({ value }) => {
        const result = schema.safeParse(payload(value));
        return result.success
          ? undefined
          : {
              fields: Object.fromEntries(
                result.error.issues.map((issue) => [issue.path[0], issue.message])
              )
            };
      }
    },
    onSubmit: async ({ value }) => {
      if (kind === 'consumption' && orderId)
        await consume
          .mutateAsync(consumptionSchema.parse({ ...payload(value), orderId }))
          .catch(() => undefined);
      else if (kind === 'receipt')
        await receive.mutateAsync(receiptSchema.parse(payload(value))).catch(() => undefined);
      else if (kind === 'adjustment')
        await adjust.mutateAsync(adjustmentSchema.parse(payload(value))).catch(() => undefined);
    }
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <fieldset disabled={mutation.isPending} className='min-w-0'>
        <FieldGroup>
          {item ? (
            <p className='text-sm'>
              {item.name} · Залишок: {stockQuantity(item.balanceMilli)} {item.unit}
            </p>
          ) : (
            <form.AppField name='itemId'>
              {(field) => (
                <field.ComboboxField
                  label='Матеріал'
                  required
                  placeholder='Оберіть позицію'
                  options={items
                    .filter((entry) => !entry.archived)
                    .map((entry) => ({
                      value: entry.id,
                      label: `${entry.name} · ${stockQuantity(entry.balanceMilli)} ${entry.unit}`
                    }))}
                />
              )}
            </form.AppField>
          )}
          <form.AppField name='quantity'>
            {(field) => (
              <field.TextField
                label={kind === 'adjustment' ? 'Зміна залишку' : 'Кількість'}
                inputMode={kind === 'adjustment' ? 'text' : 'decimal'}
                required
                description={
                  kind === 'adjustment'
                    ? 'Додатне число збільшує залишок, від’ємне — зменшує. До 3 знаків після коми.'
                    : 'У вибраній одиниці виміру, до 3 знаків після коми.'
                }
              />
            )}
          </form.AppField>
          {kind === 'consumption' ? (
            <form.AppField name='category'>
              {(field) => (
                <field.SelectField label='Вид робіт' required options={materialCategoryOptions} />
              )}
            </form.AppField>
          ) : (
            <form.Subscribe selector={(state) => state.values.quantity}>
              {(quantity) =>
                kind === 'adjustment' && quantity.startsWith('-') ? (
                  <p className='text-muted-foreground text-sm'>
                    Вартість зменшення визначається за середньою собівартістю залишку.
                  </p>
                ) : (
                  <FieldGroup>
                    <form.AppField name='totalAmount'>
                      {(field) => (
                        <field.TextField
                          label='Загальна вартість надходження'
                          required
                          inputMode='decimal'
                          description='Сума за всю введену кількість у вибраній валюті, не ціна одиниці.'
                        />
                      )}
                    </form.AppField>
                    <form.AppField name='currency'>
                      {(field) => (
                        <field.SelectField
                          label='Валюта'
                          required
                          options={[
                            { value: 'UAH', label: 'Гривня (UAH)' },
                            { value: 'EUR', label: 'Євро (EUR)' }
                          ]}
                        />
                      )}
                    </form.AppField>
                    <form.Subscribe selector={(state) => state.values.currency}>
                      {(currency) =>
                        currency === 'EUR' && (
                          <form.AppField name='exchangeRate'>
                            {(field) => (
                              <field.TextField
                                label='Курс закупівлі, грн за 1 €'
                                required
                                inputMode='decimal'
                                description='Курс цієї закупівлі, до 6 знаків після коми.'
                              />
                            )}
                          </form.AppField>
                        )
                      }
                    </form.Subscribe>
                  </FieldGroup>
                )
              }
            </form.Subscribe>
          )}
          <form.AppField name='note'>
            {(field) => (
              <field.TextareaField
                label={kind === 'adjustment' ? 'Причина коригування' : 'Примітка'}
                required={kind === 'adjustment'}
              />
            )}
          </form.AppField>
          <FormError error={mutation.error} />
          <Button type='submit' isLoading={mutation.isPending}>
            {kind === 'receipt'
              ? 'Додати надходження'
              : kind === 'adjustment'
                ? 'Провести коригування'
                : 'Списати матеріал'}
          </Button>
        </FieldGroup>
      </fieldset>
    </form>
  );
}

export function StockValuationForm({
  orgId,
  item,
  onSaved,
  onPendingChange
}: {
  orgId: string;
  item: StockItem;
  onSaved: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [operationId] = useState(() => crypto.randomUUID());
  const mutation = useMutation({ ...inventoryMutations.value(orgId), ...useFeedback(onSaved) });
  usePending(mutation.isPending, onPendingChange);
  const form = useAppForm({
    defaultValues: {
      itemId: item.id,
      operationId,
      expectedBalanceMilli: item.balanceMilli,
      expectedRevision: item.valuationRevision,
      totalAmount: '',
      note: ''
    },
    validators: { onSubmit: valuationSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value).catch(() => undefined);
    }
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <fieldset disabled={mutation.isPending} className='min-w-0'>
        <FieldGroup>
          <p className='text-sm'>
            {item.name} · Залишок: {stockQuantity(item.balanceMilli)} {item.unit}. Оцінювання
            визначить вартість поточного залишку. Старі списання залишаться без визначеної вартості.
          </p>
          <form.AppField name='totalAmount'>
            {(field) => (
              <field.TextField label='Вартість усього залишку, грн' inputMode='decimal' required />
            )}
          </form.AppField>
          <form.AppField name='note'>
            {(field) => <field.TextareaField label='Підстава оцінювання' required />}
          </form.AppField>
          <FormError error={mutation.error} />
          <Button type='submit' isLoading={mutation.isPending}>
            Зберегти оцінку
          </Button>
        </FieldGroup>
      </fieldset>
    </form>
  );
}

export function StockReversalForm({
  orgId,
  movement,
  onSaved,
  onPendingChange,
  onStateChange
}: {
  orgId: string;
  movement: StockMovement;
  onSaved: () => void;
  onPendingChange?: (pending: boolean) => void;
  onStateChange?: (state: FormState) => void;
}) {
  const formId = useId();
  useEffect(() => () => onStateChange?.({ dirty: false, pending: false }), [onStateChange]);
  const [operationId] = useState(() => crypto.randomUUID());
  const mutation = useMutation({
    ...inventoryMutations.reverse(orgId),
    ...useFeedback(() => undefined)
  });
  usePending(mutation.isPending, onPendingChange);
  const form = useAppForm({
    defaultValues: { movementId: movement.id, operationId, note: '' },
    validators: { onSubmit: reversalSchema },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(value);
        onSaved();
      } catch {
        /* Keep the reversal draft on failure. */
      }
    }
  });
  return (
    <form
      id={formId}
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
      <fieldset disabled={mutation.isPending} className='min-w-0'>
        <FieldGroup>
          <p className='text-sm'>
            На склад повернеться {stockQuantity(-movement.deltaMilli)} {movement.unit} ·{' '}
            {movement.itemName}. Історія списання збережеться.
          </p>
          <form.AppField name='note'>
            {(field) => <field.TextareaField label='Причина скасування' required />}
          </form.AppField>
          <FormError error={mutation.error} />
          <DialogActions>
            <Button type='submit' form={formId} isLoading={mutation.isPending}>
              Підтвердити скасування
            </Button>
          </DialogActions>
        </FieldGroup>
      </fieldset>
    </form>
  );
}
