'use client';
import { CrmForm } from './dialog-form';
import { customerChoices } from './choice-options';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FieldGroup } from '@/components/ui/field';
import { useAppForm } from '@/lib/form';
import { crmMutations, crmQueries } from '../api/queries';
import type { CrmWorkspace, Vehicle, RepairRequest, RepairOrder } from '../api/types';
import { customerSchema, requestSchema, orderSchema, updateVinSchema } from '../schemas/crm';
import type { CustomerInput, RequestInput, OrderInput } from '../schemas/crm';
import { Button } from './action-button';
import { VehicleSelect } from './vehicle-select';
import { FormStatus, FormActions, type SaveProps } from './form-status';
import { money, vehicleLabel } from './format';
import { businessToday } from '../lib/workflow';

function useSaveFeedback(onSaved: () => void) {
  const client = useQueryClient();
  return {
    onSuccess: () => {
      toast.success('Збережено');
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => client.invalidateQueries({ queryKey: crmQueries.all() })
  };
}

export function CustomerForm({ onSaved, onCancel, onStateChange }: SaveProps) {
  const mutation = useMutation({ ...crmMutations.customer(), ...useSaveFeedback(onSaved) });
  const form = useAppForm({
    defaultValues: { name: '', phone: '', notes: '' } satisfies CustomerInput,
    validators: { onSubmit: customerSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value).catch(() => undefined);
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
      <fieldset disabled={mutation.isPending} className='min-w-0'>
        <FieldGroup>
          <form.AppField name='name'>
            {(field) => <field.TextField label='Ім’я клієнта' required autoComplete='name' />}
          </form.AppField>
          <form.AppField name='phone'>
            {(field) => <field.TextField label='Телефон' type='tel' required autoComplete='tel' />}
          </form.AppField>
          <form.AppField name='notes'>
            {(field) => <field.TextareaField label='Нотатки' />}
          </form.AppField>
          <FormActions
            pending={mutation.isPending}
            error={mutation.error}
            onCancel={onCancel}
            label='Створити клієнта'
          />
        </FieldGroup>
      </fieldset>
    </CrmForm>
  );
}

export { VehicleForm } from './vehicle-form';

interface VinFormProps extends SaveProps {
  vehicle: Vehicle;
}

export function VinForm({ vehicle, onSaved, onCancel, onStateChange }: VinFormProps) {
  const mutation = useMutation({ ...crmMutations.vin(), ...useSaveFeedback(onSaved) });
  const form = useAppForm({
    defaultValues: { id: vehicle.id, vin: vehicle.vin ?? '' },
    validators: { onSubmit: updateVinSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value).catch(() => undefined);
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
      <fieldset disabled={mutation.isPending} className='min-w-0'>
        <FieldGroup>
          <p className='text-muted-foreground text-sm'>{vehicleLabel(vehicle)}</p>
          <form.AppField name='vin'>
            {(field) => (
              <field.TextField
                label='VIN'
                required
                maxLength={17}
                description='17 латинських літер і цифр, без I, O, Q.'
              />
            )}
          </form.AppField>
          <FormActions
            pending={mutation.isPending}
            error={mutation.error}
            onCancel={onCancel}
            label='Зберегти VIN'
          />
        </FieldGroup>
      </fieldset>
    </CrmForm>
  );
}

interface RequestFormProps extends SaveProps {
  data: CrmWorkspace;
}

export function RequestForm({ data, onSaved, onCancel, onStateChange }: RequestFormProps) {
  const mutation = useMutation({ ...crmMutations.request(), ...useSaveFeedback(onSaved) });
  const form = useAppForm({
    defaultValues: {
      customerId: '',
      vehicleId: '',
      description: '',
      plannedIntakeDate: '',
      plannedDeliveryDate: ''
    } as RequestInput,
    validators: { onSubmit: requestSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value).catch(() => undefined);
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
      <fieldset disabled={mutation.isPending} className='min-w-0'>
        <FieldGroup>
          <form.AppField
            name='customerId'
            listeners={{ onChange: () => form.setFieldValue('vehicleId', '') }}
          >
            {(field) => (
              <field.ComboboxField
                label='Клієнт'
                required
                placeholder='Виберіть клієнта'
                emptyMessage='Клієнтів ще немає. Спочатку додайте клієнта в розділі «Клієнти та авто».'
                searchPlaceholder='Ім’я або телефон…'
                options={customerChoices(data.customers)}
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.customerId}>
            {(customerId) => (
              <form.AppField name='vehicleId'>
                {() => <VehicleSelect customerId={customerId} vehicles={data.vehicles} />}
              </form.AppField>
            )}
          </form.Subscribe>
          <p className='text-muted-foreground text-sm'>
            Якщо клієнта або авто ще немає, спочатку додайте їх у розділі «Клієнти».
          </p>
          <form.AppField name='description'>
            {(field) => <field.TextareaField label='Що потрібно зробити' required />}
          </form.AppField>
          <FieldGroup className='grid gap-4 sm:grid-cols-2'>
            <form.AppField name='plannedIntakeDate'>
              {(field) => (
                <field.TextField
                  type='date'
                  label='Запланований прийом'
                  description='З датою заявка потрапить у «Заплановано».'
                />
              )}
            </form.AppField>
            <form.AppField name='plannedDeliveryDate'>
              {(field) => (
                <field.TextField
                  type='date'
                  label='Запланована видача'
                  description='Орієнтовна дата, яку можна перенести.'
                />
              )}
            </form.AppField>
          </FieldGroup>
          <form.Subscribe selector={(state) => state.values.vehicleId}>
            {(vehicleId) => (
              <FormActions
                pending={mutation.isPending}
                error={mutation.error}
                onCancel={onCancel}
                disabled={!vehicleId}
                label='Зберегти заявку'
              />
            )}
          </form.Subscribe>
        </FieldGroup>
      </fieldset>
    </CrmForm>
  );
}

interface OrderFormProps extends SaveProps {
  data: CrmWorkspace;
  request?: RepairRequest;
  order?: RepairOrder;
}

export function OrderForm({
  data,
  request,
  order,
  onSaved,
  onCancel,
  onStateChange
}: OrderFormProps) {
  const feedback = useSaveFeedback(onSaved);
  const create = useMutation({ ...crmMutations.order(), ...feedback });
  const update = useMutation({ ...crmMutations.updateOrder(), ...feedback });
  const initial = order ?? request;
  const form = useAppForm({
    defaultValues: {
      customerId: initial?.customerId ?? '',
      vehicleId: initial?.vehicleId ?? '',
      description: initial?.description ?? '',
      requestId: request?.id ?? order?.requestId ?? '',
      plannedIntakeDate: initial?.plannedIntakeDate ?? '',
      plannedDeliveryDate: initial?.plannedDeliveryDate ?? '',
      actualIntakeDate: order?.actualIntakeDate ?? businessToday(),
      items: order?.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPriceCents / 100
      })) ?? [{ description: '', quantity: 1, unitPrice: 0 }]
    } as OrderInput,
    validators: { onSubmit: orderSchema },
    onSubmit: async ({ value }) => {
      if (order)
        await update
          .mutateAsync({ id: order.id, description: value.description, items: value.items })
          .catch(() => undefined);
      else await create.mutateAsync(value).catch(() => undefined);
    }
  });
  const fixedVehicle = data.vehicles.find((vehicle) => vehicle.id === initial?.vehicleId);
  const fixedCustomer = data.customers.find((customer) => customer.id === initial?.customerId);
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
      <fieldset disabled={create.isPending || update.isPending} className='min-w-0'>
        <FieldGroup>
          {initial ? (
            <div className='bg-muted min-w-0 break-words rounded-lg p-3 text-sm'>
              <p className='font-medium'>
                {fixedCustomer?.name} · {fixedCustomer?.phone}
              </p>
              <p>{fixedVehicle && vehicleLabel(fixedVehicle)}</p>
              <p className='text-muted-foreground font-mono'>
                {fixedVehicle?.vin || 'Спочатку додайте VIN у розділі «Клієнти»'}
              </p>
            </div>
          ) : (
            <>
              <form.AppField
                name='customerId'
                listeners={{ onChange: () => form.setFieldValue('vehicleId', '') }}
              >
                {(field) => (
                  <field.ComboboxField
                    label='Клієнт'
                    required
                    placeholder='Виберіть клієнта'
                    emptyMessage='Клієнтів ще немає. Спочатку додайте клієнта в розділі «Клієнти та авто».'
                    searchPlaceholder='Ім’я або телефон…'
                    options={customerChoices(data.customers)}
                  />
                )}
              </form.AppField>
              <form.Subscribe selector={(state) => state.values.customerId}>
                {(customerId) => (
                  <form.AppField name='vehicleId'>
                    {() => (
                      <VehicleSelect customerId={customerId} vehicles={data.vehicles} requireVin />
                    )}
                  </form.AppField>
                )}
              </form.Subscribe>
            </>
          )}
          <form.AppField name='description'>
            {(field) => <field.TextareaField label='Опис замовлення' required />}
          </form.AppField>
          {!order && (
            <>
              <FieldGroup className='grid gap-4 sm:grid-cols-2'>
                <form.AppField name='plannedIntakeDate'>
                  {(field) => (
                    <field.TextField
                      type='date'
                      label='Запланований прийом'
                      disabled={!!request}
                      description={
                        request
                          ? 'План із заявки. Для перенесення скористайтеся «Статус і дати».'
                          : 'План не змінюється автоматично через запізнення.'
                      }
                    />
                  )}
                </form.AppField>
                <form.AppField name='plannedDeliveryDate'>
                  {(field) => (
                    <field.TextField type='date' label='Запланована видача' disabled={!!request} />
                  )}
                </form.AppField>
              </FieldGroup>
              <form.AppField name='actualIntakeDate'>
                {(field) => (
                  <field.TextField
                    type='date'
                    label='Фактичний прийом'
                    max={businessToday()}
                    required
                  />
                )}
              </form.AppField>
            </>
          )}
          <form.Field name='items' mode='array'>
            {(array) => (
              <fieldset className='flex min-w-0 flex-col gap-4'>
                <legend className='mb-3 text-sm font-medium'>Позиції робіт · ціни у гривнях</legend>
                {array.state.value.map((_, index) => (
                  <div key={index} className='flex flex-col gap-3 rounded-lg border p-3'>
                    <form.AppField name={`items[${index}].description`}>
                      {(field) => (
                        <field.TextField
                          label={`Робота ${index + 1}`}
                          placeholder='Фарбування переднього бампера'
                          required
                        />
                      )}
                    </form.AppField>
                    <div className='grid grid-cols-2 gap-3'>
                      <form.AppField name={`items[${index}].quantity`}>
                        {(field) => (
                          <field.TextField
                            label='Кількість'
                            type='number'
                            min={1}
                            max={999}
                            step={1}
                            required
                          />
                        )}
                      </form.AppField>
                      <form.AppField name={`items[${index}].unitPrice`}>
                        {(field) => (
                          <field.TextField
                            label='Ціна за одиницю, грн'
                            type='number'
                            min={0}
                            max={1000000}
                            step='0.01'
                            required
                          />
                        )}
                      </form.AppField>
                    </div>
                    <Button
                      type='button'
                      variant='ghost'
                      disabled={array.state.value.length === 1}
                      onClick={() => array.removeValue(index)}
                      aria-label={`Видалити роботу ${index + 1}`}
                    >
                      Видалити позицію
                    </Button>
                  </div>
                ))}
                <Button
                  type='button'
                  variant='outline'
                  disabled={array.state.value.length >= 100}
                  onClick={() => array.pushValue({ description: '', quantity: 1, unitPrice: 0 })}
                >
                  Додати позицію
                </Button>
              </fieldset>
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.items}>
            {(items) => (
              <p className='text-right text-lg font-semibold' aria-live='polite'>
                Разом:{' '}
                {money(
                  items.reduce(
                    (sum, item) =>
                      sum +
                      (Number(item.quantity) || 0) *
                        Math.round((Number(item.unitPrice) || 0) * 100),
                    0
                  )
                )}
              </p>
            )}
          </form.Subscribe>
          <form.Subscribe selector={(state) => state.values.vehicleId}>
            {(vehicleId) => (
              <FormActions
                pending={create.isPending || update.isPending}
                error={create.error || update.error}
                onCancel={onCancel}
                disabled={
                  !vehicleId || !data.vehicles.find((vehicle) => vehicle.id === vehicleId)?.vin
                }
                label={order ? 'Зберегти замовлення' : 'Взяти в роботу'}
              />
            )}
          </form.Subscribe>
        </FieldGroup>
      </fieldset>
    </CrmForm>
  );
}
