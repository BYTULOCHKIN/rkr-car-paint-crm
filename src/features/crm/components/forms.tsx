'use client';
import { useEffect, useCallback, useState, useId, type ReactNode } from 'react';
import { primaryContact } from '../lib/customer-contacts';
import { CrmForm } from './dialog-form';
import { assigneeLabel } from '../lib/assignee';
import { CustomerSelect } from './customer-select';
import { VehicleBrandAvatar } from '@/components/vehicle-brand-avatar';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FieldError, FieldGroup } from '@/components/ui/field';
import { useAppForm } from '@/lib/form';
import { crmMutations, crmQueries } from '../api/queries';
import type { CrmWorkspace, Vehicle, RepairRequest, RepairOrder } from '../api/types';
import { requestSchema, orderSchema, updateVinSchema } from '../schemas/crm';
import type { RequestInput, OrderInput } from '../schemas/crm';
import { Button } from './action-button';
import { VehicleSelect } from './vehicle-select';
import { FormStatus, FormActions, type SaveProps } from './form-status';
import { money, vehicleLabel } from './format';
import { PaintPlanEditor } from './paint-plan-editor';
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

export { CustomerForm } from './customer-form';

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
            {() => <CustomerSelect data={data} />}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.customerId}>
            {(customerId) => (
              <form.AppField name='vehicleId'>
                {() => (
                  <VehicleSelect
                    key={customerId}
                    access={data.access}
                    serverRead={data.serverRead}
                    customerId={customerId}
                    vehicles={data.vehicles}
                  />
                )}
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
                <field.CalendarDateField
                  label='Запланований прийом'
                  description='З датою заявка потрапить у «Заплановано».'
                />
              )}
            </form.AppField>
            <form.AppField name='plannedDeliveryDate'>
              {(field) => (
                <field.CalendarDateField
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

export interface OrderFormSections {
  main: ReactNode;
  works: ReactNode;
}

interface OrderFormProps extends SaveProps {
  renderSections?: (sections: OrderFormSections) => ReactNode;
  onSectionStateChange?: (
    section: 'main' | 'works',
    state: { dirty: boolean; pending: boolean }
  ) => void;
  onInvalidSection?: (section: 'main' | 'works') => void;
  onCreated?: (id: string) => void;
  disabled?: boolean;
  data: CrmWorkspace;
  request?: RepairRequest;
  order?: RepairOrder;
}

function orderFormValues(
  order?: RepairOrder,
  request?: RepairRequest,
  defaultShareBps = 6000
): OrderInput {
  return {
    customerId: (order ?? request)?.customerId ?? '',
    vehicleId: (order ?? request)?.vehicleId ?? '',
    description: (order ?? request)?.description ?? '',
    requestId: request?.id ?? order?.requestId ?? '',
    employeeShareBps: order?.defaultEmployeeShareBps ?? defaultShareBps,
    assigneeId: order ? (order.assigneeId ?? undefined) : '',
    plannedIntakeDate: (order ?? request)?.plannedIntakeDate ?? '',
    plannedDeliveryDate: (order ?? request)?.plannedDeliveryDate ?? '',
    actualIntakeDate: order?.actualIntakeDate ?? '',
    paintPlan: order?.paintPlan ?? [],
    items: order?.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPriceCents / 100
    })) ?? [{ description: '', quantity: 1, unitPrice: 0 }]
  } as OrderInput;
}

export function OrderForm({
  data,
  disabled = false,
  request,
  order,
  onSaved,
  onCancel,
  onStateChange,
  renderSections,
  onSectionStateChange,
  onInvalidSection,
  onCreated
}: OrderFormProps) {
  const shareId = useId();
  const client = useQueryClient();
  const feedback = useSaveFeedback(onSaved);
  const create = useMutation({ ...crmMutations.order(), ...feedback });
  const update = useMutation({ ...crmMutations.updateOrder(), ...feedback });
  const initial = order ?? request;
  const [baseline, setBaseline] = useState(() => ({
    values: orderFormValues(order, request, data.finance?.defaultShareBps),
    revision: order?.workflowRevision ?? 0
  }));
  const [sourceOrder, setSourceOrder] = useState(order);
  const form = useAppForm({
    defaultValues: baseline.values,
    validators: { onSubmit: orderSchema },
    onSubmitInvalid: ({ formApi }) => {
      const parsed = orderSchema.safeParse(formApi.state.values);
      if (!parsed.success)
        onInvalidSection?.(
          ['items', 'paintPlan'].includes(String(parsed.error.issues[0]?.path[0]))
            ? 'works'
            : 'main'
        );
    },
    onSubmit: async ({ value }) => {
      if (order) {
        try {
          await update.mutateAsync({
            id: order.id,
            expectedRevision: baseline.revision,
            ...(value.assigneeId ? { assigneeId: value.assigneeId } : {}),
            employeeShareBps: value.employeeShareBps,
            description: value.description,
            items: value.items,
            paintPlan: value.paintPlan
          });
          const latest = data.access
            ? client
                .getQueryData<CrmWorkspace>(
                  crmQueries.detail(data.access.userId, data.access.orgId, order.id).queryKey
                )
                ?.orders.find((entry) => entry.id === order.id)
            : undefined;
          const changed = (
            ['description', 'assigneeId', 'employeeShareBps', 'items', 'paintPlan'] as const
          ).some((key) => JSON.stringify(value[key]) !== JSON.stringify(baseline.values[key]));
          const revision = latest?.workflowRevision ?? baseline.revision + Number(changed);
          const savedValues = latest ? orderFormValues(latest) : value;
          setBaseline({ values: savedValues, revision });
        } catch {
          /* The mutation exposes its error in the form. */
        }
      } else {
        try {
          const id = await create.mutateAsync(value);
          onCreated?.(id);
        } catch {
          /* Keep the draft on failure. */
        }
      }
    }
  });
  if (order !== sourceOrder) {
    setSourceOrder(order);
    if (order && form.state.isDefaultValue)
      setBaseline({ values: orderFormValues(order), revision: order.workflowRevision ?? 0 });
  }
  useEffect(() => {
    form.reset(baseline.values);
  }, [baseline, form]);
  const fixedVehicle = data.vehicles.find((vehicle) => vehicle.id === initial?.vehicleId);
  const fixedCustomer = data.customers.find((customer) => customer.id === initial?.customerId);
  const mainState = useCallback(
    (state: { dirty: boolean; pending: boolean }) => onSectionStateChange?.('main', state),
    [onSectionStateChange]
  );
  const worksState = useCallback(
    (state: { dirty: boolean; pending: boolean }) => onSectionStateChange?.('works', state),
    [onSectionStateChange]
  );
  const mainFields = (
    <>
      {' '}
      {initial ? (
        <div className='bg-muted min-w-0 break-words rounded-lg p-3 text-sm'>
          <p className='font-medium'>
            {fixedCustomer?.name} · {primaryContact(fixedCustomer)}
          </p>
          {fixedVehicle && (
            <div className='my-2 flex items-center gap-2'>
              <VehicleBrandAvatar make={fixedVehicle.make} />
              <p className='min-w-0 flex-1 break-words [overflow-wrap:anywhere]'>
                {vehicleLabel(fixedVehicle)}
              </p>
            </div>
          )}
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
            {() => <CustomerSelect data={data} />}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.customerId}>
            {(customerId) => (
              <form.AppField name='vehicleId'>
                {() => (
                  <VehicleSelect
                    key={customerId}
                    access={data.access}
                    serverRead={data.serverRead}
                    customerId={customerId}
                    vehicles={data.vehicles}
                    requireVin
                  />
                )}
              </form.AppField>
            )}
          </form.Subscribe>
        </>
      )}
      <form.AppField name='assigneeId'>
        {(field) => (
          <field.ComboboxField
            label='Відповідальний'
            required={!order}
            clearable={false}
            placeholder='Виберіть учасника команди'
            searchPlaceholder='Ім’я відповідального…'
            emptyMessage='Немає активних учасників. Запросіть команду в розділі «Команда».'
            description={
              order?.assigneeId && !data.team?.some((member) => member.id === order.assigneeId)
                ? `Поточний виконавець: ${assigneeLabel(order)}. Якщо учасник уже залишив команду, призначте іншого.`
                : 'Цьому учаснику нараховується частка від суми замовлення після віднімання матеріалів і субпідряду.'
            }
            options={[
              ...(data.team ?? []).map((member) => ({
                value: member.id,
                label: member.name,
                description: member.role === 'admin' ? 'Адміністратор' : 'Виконавець'
              })),
              ...(order?.assigneeId && !data.team?.some((member) => member.id === order.assigneeId)
                ? [
                    {
                      value: order.assigneeId,
                      label: assigneeLabel(order),
                      description: 'Більше не в команді',
                      disabled: true
                    }
                  ]
                : [])
            ]}
          />
        )}
      </form.AppField>
      <form.Field name='employeeShareBps'>
        {(field) => (
          <div className='grid gap-2'>
            <Label htmlFor={shareId}>Частка відповідального, %</Label>
            <Input
              id={shareId}
              aria-invalid={field.state.meta.errors.length > 0}
              aria-describedby={field.state.meta.errors.length ? `${shareId}-error` : undefined}
              type='number'
              min={0}
              max={100}
              step={0.01}
              value={(field.state.value ?? 6000) / 100}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(Math.round(Number(event.target.value) * 100))}
            />
            {field.state.meta.errors.length > 0 && (
              <FieldError id={`${shareId}-error`} errors={field.state.meta.errors} />
            )}
            <p className='text-muted-foreground text-sm'>
              Нараховується при готовності авто незалежно від оплати клієнтом.
            </p>
          </div>
        )}
      </form.Field>
      <form.AppField name='description'>
        {(field) => <field.TextareaField label='Опис замовлення' required />}
      </form.AppField>
      {!order && (
        <>
          <FieldGroup className='grid gap-4 sm:grid-cols-2'>
            <form.AppField name='plannedIntakeDate'>
              {(field) => (
                <field.CalendarDateField
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
                <field.CalendarDateField label='Запланована видача' disabled={!!request} />
              )}
            </form.AppField>
          </FieldGroup>
          <form.AppField name='actualIntakeDate'>
            {(field) => (
              <field.CalendarDateField
                label='Фактичний прийом (необов’язково)'
                max={businessToday()}
              />
            )}
          </form.AppField>
        </>
      )}
    </>
  );
  const workFields = (
    <>
      {' '}
      <form.Field name='paintPlan'>
        {(field) => (
          <PaintPlanEditor
            value={field.state.value ?? []}
            disabled={disabled || create.isPending || update.isPending}
            onChange={field.handleChange}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <form.Field name='items' mode='array'>
        {(array) => (
          <fieldset className='flex min-w-0 flex-col gap-4'>
            <legend className='mb-3 text-base font-semibold'>Позиції робіт</legend>
            <p className='text-muted-foreground text-sm'>
              Додайте роботи та вартість у гривнях. Позначки на схемі не змінюють суму замовлення.
            </p>
            {array.state.value.map((_, index) => (
              <div
                key={index}
                className='flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4'
              >
                <div className='flex items-center justify-between gap-3 text-sm'>
                  <span className='text-muted-foreground'>Позиція {index + 1}</span>
                  <strong>
                    {money(
                      (Number(array.state.value[index].quantity) || 0) *
                        Math.round((Number(array.state.value[index].unitPrice) || 0) * 100)
                    )}
                  </strong>
                </div>
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
                  (Number(item.quantity) || 0) * Math.round((Number(item.unitPrice) || 0) * 100),
                0
              )
            )}
          </p>
        )}
      </form.Subscribe>
    </>
  );
  const actions = (
    <>
      {' '}
      <form.Subscribe selector={(state) => state.values.vehicleId}>
        {(vehicleId) => (
          <FormActions
            pending={create.isPending || update.isPending}
            error={create.error || update.error}
            onCancel={onCancel}
            disabled={
              disabled ||
              !vehicleId ||
              ![
                ...data.vehicles,
                ...client
                  .getQueriesData<CrmWorkspace>({
                    queryKey: ['crm', data.access?.userId, data.access?.orgId, 'list']
                  })
                  .flatMap(([, value]) => value?.vehicles ?? [])
              ].find((vehicle) => vehicle.id === vehicleId)?.vin
            }
            label={order ? 'Зберегти замовлення' : 'Створити замовлення'}
          />
        )}
      </form.Subscribe>
    </>
  );
  const status = (
    <form.Subscribe selector={(state) => ({ values: state.values, pending: state.isSubmitting })}>
      {({ values, pending }) => {
        const mainDirty = [
          'customerId',
          'vehicleId',
          'description',
          'assigneeId',
          'employeeShareBps',
          'plannedIntakeDate',
          'plannedDeliveryDate',
          'actualIntakeDate'
        ].some(
          (key) => values[key as keyof OrderInput] !== baseline.values[key as keyof OrderInput]
        );
        const worksDirty =
          JSON.stringify([values.items, values.paintPlan]) !==
          JSON.stringify([baseline.values.items, baseline.values.paintPlan]);
        return (
          <>
            <FormStatus
              dirty={mainDirty || worksDirty}
              pending={pending}
              onChange={onStateChange}
            />
            {onSectionStateChange && (
              <>
                <FormStatus dirty={mainDirty} pending={pending} onChange={mainState} />
                <FormStatus dirty={worksDirty} pending={pending} onChange={worksState} />
              </>
            )}
          </>
        );
      }}
    </form.Subscribe>
  );
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void form.handleSubmit();
  };
  const section = (fields: ReactNode) => (
    <CrmForm noValidate onSubmit={submit}>
      <fieldset disabled={disabled || create.isPending || update.isPending} className='min-w-0'>
        <FieldGroup>
          {fields}
          {actions}
        </FieldGroup>
      </fieldset>
    </CrmForm>
  );
  return (
    <>
      {status}
      {renderSections ? (
        renderSections({ main: section(mainFields), works: section(workFields) })
      ) : (
        <CrmForm onSubmit={submit}>
          <fieldset disabled={disabled || create.isPending || update.isPending} className='min-w-0'>
            <FieldGroup>
              {mainFields}
              {workFields}
              {actions}
            </FieldGroup>
          </fieldset>
        </CrmForm>
      )}
    </>
  );
}
