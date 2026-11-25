'use client';

import { useEffect, useState, useId } from 'react';
import { DialogActions } from '@/features/crm/components/dialog-form';
import { FormStatus, type FormState } from '@/features/crm/components/form-status';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/use-debounce';
import { toast } from 'sonner';
import { useStore } from '@tanstack/react-form';
import { useAppForm } from '@/lib/form';
import { Button } from '@/features/crm/components/action-button';
import { FieldGroup } from '@/components/ui/field';
import { Icons } from '@/components/icons';
import { crmQueries } from '@/features/crm/api/queries';
import { inventoryMutations, inventoryQueries } from '../api/queries';
import type { StockItem, StockMovement } from '../api/types';
import { batchConsumptionSchema, type BatchConsumptionInput } from '../schemas/inventory';
import { stockQuantity, materialCategoryOptions } from '../lib/format';

function emptyRow(): BatchConsumptionInput['rows'][number] {
  return { itemId: '', quantity: '', category: 'painting', note: '' };
}

function materialChoice(item: StockItem) {
  return {
    value: item.id,
    label: item.name,
    description:
      item.accountingMode === 'amount'
        ? 'За сумою · без контролю залишку'
        : `Залишок: ${stockQuantity(item.balanceMilli)} ${item.unit}`,
    disabled: item.accountingMode !== 'amount' && item.balanceMilli <= 0
  };
}

export function BatchConsumptionForm({
  userId,
  orgId,
  orderId,
  items,
  movements,
  onSaved,
  onPendingChange,
  onStateChange,
  disabled = false
}: {
  userId: string;
  orgId: string;
  orderId: string;
  items: StockItem[];
  movements: StockMovement[];
  onSaved: () => void;
  onPendingChange?: (pending: boolean) => void;
  onStateChange?: (state: FormState) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 300);
  const candidates = useQuery(
    inventoryQueries.items(userId, orgId, { search: debounced, tags: [], archived: false })
  );
  const [knownItems, setKnownItems] = useState(items);
  const formId = useId();
  const [operationId] = useState(() => crypto.randomUUID());
  const client = useQueryClient();
  const mutation = useMutation({
    ...inventoryMutations.consumeBatch(orgId),
    onSuccess: () => {
      toast.success('Матеріали списано');
    },
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: inventoryQueries.all() }),
        client.invalidateQueries({ queryKey: crmQueries.all() })
      ])
  });
  useEffect(() => {
    onPendingChange?.(mutation.isPending);
    return () => onPendingChange?.(false);
  }, [mutation.isPending, onPendingChange]);
  useEffect(() => () => onStateChange?.({ dirty: false, pending: false }), [onStateChange]);
  const recentValues = [
    ...new Set(
      movements
        .filter((movement) => movement.kind === 'consumption' && !movement.reversed)
        .map((movement) => movement.itemId)
    )
  ].slice(0, 8);
  const form = useAppForm({
    defaultValues: { operationId, orderId, rows: [emptyRow()] },
    validators: { onSubmit: batchConsumptionSchema },
    onSubmit: async ({ value }) => {
      try {
        await mutation.mutateAsync(value);
        onSaved();
      } catch {
        /* Keep the draft on failure. */
      }
    }
  });
  const rows = useStore(form.store, (state) => state.values.rows);
  const selectedIds = new Set(rows.map((row) => row.itemId));
  const options = [
    ...new Map(
      [
        ...knownItems.filter((item) => !debounced.trim() && selectedIds.has(item.id)),
        ...(candidates.data?.items ?? [])
      ].map((item) => [item.id, item])
    ).values()
  ]
    .filter((item) => !item.archived)
    .map(materialChoice);
  return (
    <form
      id={formId}
      aria-label='Списання матеріалів'
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
      <fieldset disabled={mutation.isPending || disabled} className='min-w-0'>
        <FieldGroup>
          <p className='text-muted-foreground text-sm'>
            Додайте всі матеріали та збережіть їх разом.
          </p>
          <form.Field name='rows' mode='array'>
            {(array) => (
              <>
                {array.state.value.map((_, index) => (
                  <fieldset key={index} className='min-w-0 rounded-md border p-3'>
                    <legend className='px-1 text-sm font-medium'>Матеріал {index + 1}</legend>
                    <FieldGroup>
                      <form.AppField name={`rows[${index}].itemId`}>
                        {(field) => (
                          <field.ComboboxField
                            label='Матеріал'
                            required
                            options={options}
                            selectedOption={
                              knownItems
                                .filter((item) => item.id === field.state.value)
                                .map(materialChoice)[0]
                            }
                            onSearchChange={setSearch}
                            onOptionChange={(option) => {
                              const item = candidates.data?.items.find(
                                (row) => row.id === option?.value
                              );
                              form.setFieldValue(`rows[${index}].quantity`, '');
                              form.setFieldValue(
                                `rows[${index}].amount`,
                                item?.accountingMode === 'amount' ? '' : undefined
                              );
                              if (item)
                                setKnownItems((previous) => [
                                  ...new Map(
                                    [...previous, item].map((row) => [row.id, row])
                                  ).values()
                                ]);
                            }}
                            loading={candidates.isFetching}
                            errorMessage={
                              candidates.isError ? 'Не вдалося завантажити матеріали' : undefined
                            }
                            onRetry={() => void candidates.refetch()}
                            recentValues={recentValues}
                            placeholder='Оберіть матеріал'
                            searchPlaceholder='Назва матеріалу…'
                            emptyMessage={
                              debounced.trim()
                                ? 'За цим пошуком нічого не знайдено.'
                                : 'Додайте матеріали на склад'
                            }
                          />
                        )}
                      </form.AppField>
                      <form.Subscribe selector={(state) => state.values.rows[index]?.itemId}>
                        {(itemId) => {
                          const item =
                            knownItems.find((entry) => entry.id === itemId) ??
                            candidates.data?.items.find((entry) => entry.id === itemId);
                          return item ? (
                            <p className='text-muted-foreground text-sm'>
                              {item.accountingMode === 'amount' ? (
                                'За сумою · без контролю залишку'
                              ) : (
                                <>
                                  Одиниця: {item.unit} · Залишок: {stockQuantity(item.balanceMilli)}{' '}
                                  {item.unit}
                                </>
                              )}
                            </p>
                          ) : null;
                        }}
                      </form.Subscribe>
                      <div className='grid gap-3 sm:grid-cols-2'>
                        <form.Subscribe selector={(state) => state.values.rows[index]?.itemId}>
                          {(itemId) => {
                            const item =
                              knownItems.find((entry) => entry.id === itemId) ??
                              candidates.data?.items.find((entry) => entry.id === itemId);
                            return item?.accountingMode === 'amount' ? (
                              <form.AppField name={`rows[${index}].amount`}>
                                {(field) => (
                                  <field.TextField
                                    label='Сума витрати, грн'
                                    required
                                    inputMode='decimal'
                                    placeholder='3500,00'
                                  />
                                )}
                              </form.AppField>
                            ) : (
                              <form.AppField name={`rows[${index}].quantity`}>
                                {(field) => (
                                  <field.TextField
                                    label='Кількість'
                                    required
                                    inputMode='decimal'
                                    placeholder='0,8'
                                  />
                                )}
                              </form.AppField>
                            );
                          }}
                        </form.Subscribe>
                        <form.AppField name={`rows[${index}].category`}>
                          {(field) => (
                            <field.SelectField
                              label='Для робіт'
                              required
                              options={materialCategoryOptions}
                            />
                          )}
                        </form.AppField>
                      </div>
                      <form.AppField name={`rows[${index}].note`}>
                        {(field) => <field.TextField label='Примітка' maxLength={1000} />}
                      </form.AppField>
                      {array.state.value.length > 1 && (
                        <Button
                          type='button'
                          variant='ghost'
                          aria-label={`Прибрати матеріал ${index + 1}`}
                          onClick={() => array.removeValue(index)}
                        >
                          <Icons.trash data-icon='inline-start' aria-hidden />
                          Прибрати
                        </Button>
                      )}
                    </FieldGroup>
                  </fieldset>
                ))}
                <Button
                  type='button'
                  variant='outline'
                  disabled={array.state.value.length >= 100}
                  onClick={() => array.pushValue(emptyRow())}
                >
                  <Icons.add data-icon='inline-start' aria-hidden />
                  Ще матеріал
                </Button>
              </>
            )}
          </form.Field>
          {mutation.error && (
            <p role='alert' className='text-destructive text-sm'>
              {mutation.error.message}
            </p>
          )}
          <DialogActions>
            <Button type='submit' form={formId} isLoading={mutation.isPending} disabled={disabled}>
              Списати матеріали
            </Button>
          </DialogActions>
        </FieldGroup>
      </fieldset>
    </form>
  );
}
