'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppForm } from '@/lib/form';
import { FieldGroup } from '@/components/ui/field';
import { Button } from '@/features/crm/components/action-button';
import type { StockItem, StockMovement } from '../api/types';
import { inventoryMutations, inventoryQueries } from '../api/queries';
import {
  itemSchema,
  updateItemSchema,
  stockUnitSchema,
  receiptSchema,
  adjustmentSchema,
  consumptionSchema,
  reversalSchema
} from '../schemas/inventory';
import { stockQuantity } from '../lib/format';
import { stockUnitOptions } from '../constants/units';

function useFeedback(onSaved: () => void) {
  const client = useQueryClient();
  return {
    onSuccess: () => {
      toast.success('Збережено');
      onSaved();
    },
    onSettled: () => client.invalidateQueries({ queryKey: inventoryQueries.all() })
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
    defaultValues: { name: item?.name ?? '', unit: item?.unit ?? 'шт', notes: item?.notes ?? '' },
    validators: {
      onSubmit: updateItemSchema
        .omit({ id: true })
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
  const form = useAppForm({
    defaultValues: { itemId: item?.id ?? '', operationId, quantity: '', note: '' },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      if (kind === 'consumption' && orderId)
        await consume.mutateAsync({ ...value, orderId }).catch(() => undefined);
      else if (kind === 'receipt') await receive.mutateAsync(value).catch(() => undefined);
      else if (kind === 'adjustment') await adjust.mutateAsync(value).catch(() => undefined);
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

export function StockReversalForm({
  orgId,
  movement,
  onSaved,
  onPendingChange
}: {
  orgId: string;
  movement: StockMovement;
  onSaved: () => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [operationId] = useState(() => crypto.randomUUID());
  const mutation = useMutation({ ...inventoryMutations.reverse(orgId), ...useFeedback(onSaved) });
  usePending(mutation.isPending, onPendingChange);
  const form = useAppForm({
    defaultValues: { movementId: movement.id, operationId, note: '' },
    validators: { onSubmit: reversalSchema },
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
            На склад повернеться {stockQuantity(-movement.deltaMilli)} {movement.unit} ·{' '}
            {movement.itemName}. Історія списання збережеться.
          </p>
          <form.AppField name='note'>
            {(field) => <field.TextareaField label='Причина скасування' required />}
          </form.AppField>
          <FormError error={mutation.error} />
          <Button type='submit' isLoading={mutation.isPending}>
            Підтвердити скасування
          </Button>
        </FieldGroup>
      </fieldset>
    </form>
  );
}
