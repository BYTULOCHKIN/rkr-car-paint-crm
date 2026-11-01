'use client';
import { CrmForm } from './dialog-form';
import { customerChoices } from './choice-options';

import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAppForm } from '@/lib/form';
import { FieldGroup } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { crmQueries, crmMutations } from '../api/queries';
import type { CrmWorkspace, Customer, Vehicle } from '../api/types';
import { vehicleSchema, vinSchema } from '../schemas/crm';
import { FormStatus, FormActions, type SaveProps } from './form-status';
import { Button } from './action-button';
import { Icons } from '@/components/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const MAX_YEAR = new Date().getFullYear() + 1;
const YEAR_OPTIONS = Array.from({ length: MAX_YEAR - 1899 }, (_, index) =>
  String(MAX_YEAR - index)
);

interface VehicleFormProps extends SaveProps {
  customer?: Customer;
  data: CrmWorkspace;
  vehicle?: Vehicle;
}
const schema = vehicleSchema.omit({ year: true }).extend({
  year: z
    .string()
    .regex(/^\d{4}$/, 'Виберіть рік')
    .refine((year) => Number(year) >= 1900 && Number(year) <= MAX_YEAR, 'Некоректний рік')
});

function options(values: string[]) {
  return [...new Set(values.filter(Boolean))].map((value) => ({ value, label: value }));
}
function recent(values: string[]) {
  return [...new Set(values.filter(Boolean))].slice(0, 5);
}

export function VehicleForm({
  customer,
  data,
  vehicle,
  onSaved,
  onCancel,
  onStateChange
}: VehicleFormProps) {
  const client = useQueryClient();
  const vinHelpId = useId();
  const [decoding, setDecoding] = useState(false);
  const [message, setMessage] = useState('');
  const feedback = {
    onSuccess: () => {
      toast.success(vehicle ? 'Автомобіль оновлено' : 'Автомобіль створено');
      onSaved();
    },
    onSettled: () => client.invalidateQueries({ queryKey: crmQueries.all() })
  };
  const create = useMutation({
    ...crmMutations.vehicle(),
    ...feedback
  });
  const update = useMutation({ ...crmMutations.updateVehicle(), ...feedback });
  const mutation = vehicle ? update : create;
  const linked =
    !!vehicle &&
    (data.requests.some((request) => request.vehicleId === vehicle.id) ||
      data.orders.some((order) => order.vehicleId === vehicle.id));
  const form = useAppForm({
    defaultValues: {
      customerId: vehicle?.customerId ?? customer?.id ?? '',
      make: vehicle?.make.toUpperCase() ?? '',
      model: vehicle?.model ?? '',
      year: vehicle?.year ? String(vehicle.year) : '',
      plate: vehicle?.plate ?? '',
      vin: vehicle?.vin ?? ''
    },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      const input = { ...value, year: Number(value.year) };
      if (vehicle) await update.mutateAsync({ ...input, id: vehicle.id }).catch(() => undefined);
      else await create.mutateAsync(input).catch(() => undefined);
    }
  });
  const makes = useQuery(crmQueries.catalog(''));

  async function decode(): Promise<void> {
    const vin = form.getFieldValue('vin').trim().toUpperCase();
    if (!vinSchema.safeParse(vin).success) {
      setMessage('Вкажіть коректний VIN: 17 літер і цифр без I, O, Q.');
      return;
    }
    setDecoding(true);
    setMessage('');
    try {
      const result = await client.fetchQuery(
        crmQueries.vin(vin, Number(form.getFieldValue('year')) || undefined)
      );
      if (form.getFieldValue('vin').trim().toUpperCase() !== vin) return;
      if (result.make) form.setFieldValue('make', result.make);
      if (result.model) form.setFieldValue('model', result.model);
      if (result.year) form.setFieldValue('year', String(result.year));
      form.setFieldValue('vin', vin);
      setMessage(!result.make && !result.model && !result.year ? result.message : '');
    } catch {
      setMessage('Не вдалося отримати дані VIN. Спробуйте ще раз або виберіть дані вручну.');
    } finally {
      setDecoding(false);
    }
  }

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
          pending: state.isSubmitting || decoding
        })}
      >
        {(state) => <FormStatus {...state} onChange={onStateChange} />}
      </form.Subscribe>
      <fieldset disabled={mutation.isPending || decoding} className='min-w-0'>
        <FieldGroup>
          <form.AppField name='vin'>
            {(field) => (
              <field.TextField
                label='VIN (необов’язково)'
                maxLength={17}
                disabled={linked && !!vehicle?.vin}
                labelAction={
                  <Tooltip>
                    <TooltipTrigger
                      aria-describedby={vinHelpId}
                      render={
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon-xs'
                          aria-label='Інформація про VIN'
                        />
                      }
                    >
                      <Icons.info />
                    </TooltipTrigger>
                    <TooltipContent id={vinHelpId} role='tooltip'>
                      Дані за VIN можуть бути неповними — перевірте їх. Пошук надсилає VIN до NHTSA
                      vPIC.{linked && ' VIN авто з історією змінювати не можна.'}
                    </TooltipContent>
                  </Tooltip>
                }
              />
            )}
          </form.AppField>
          <Button
            type='button'
            variant='outline'
            isLoading={decoding}
            onClick={() => void decode()}
          >
            Заповнити за VIN
          </Button>
          {message && (
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}
          {makes.data?.warning && (
            <Alert>
              <AlertDescription>{makes.data.warning}</AlertDescription>
            </Alert>
          )}
          <form.Subscribe selector={(state) => state.values.make}>
            {(make) => (
              <>
                <form.AppField
                  name='make'
                  listeners={{ onChange: () => form.setFieldValue('model', '') }}
                >
                  {(field) => (
                    <field.ComboboxField
                      label='Марка'
                      required
                      placeholder='Виберіть марку'
                      searchPlaceholder='Пошук марки…'
                      emptyMessage='Марки недоступні'
                      loading={makes.isFetching}
                      loadingMessage='Завантаження марок…'
                      errorMessage={makes.isError ? 'Не вдалося завантажити марки.' : undefined}
                      onRetry={() => void makes.refetch()}
                      options={options([
                        ...(makes.data?.makes ?? []),
                        ...data.vehicles.map((vehicle) => vehicle.make.toUpperCase()),
                        make
                      ])}
                      recentValues={recent(
                        data.vehicles.map((vehicle) => vehicle.make.toUpperCase())
                      )}
                    />
                  )}
                </form.AppField>
                <ModelField
                  make={make}
                  data={data}
                  value={form.getFieldValue('model')}
                  render={(choices, warning, pending, failed, retry) => (
                    <>
                      <form.AppField name='model'>
                        {(field) => (
                          <field.ComboboxField
                            label='Модель'
                            required
                            placeholder='Виберіть модель'
                            searchPlaceholder='Пошук моделі…'
                            disabled={!make}
                            loading={!!make && pending}
                            loadingMessage='Завантаження моделей…'
                            errorMessage={failed ? 'Не вдалося завантажити моделі.' : undefined}
                            onRetry={retry}
                            options={choices}
                            emptyMessage={
                              !make
                                ? 'Спочатку виберіть марку'
                                : 'Моделей немає в довіднику. Спробуйте отримати дані за VIN.'
                            }
                            recentValues={recent(
                              data.vehicles
                                .filter((vehicle) => vehicle.make.toUpperCase() === make)
                                .map((vehicle) => vehicle.model)
                            )}
                          />
                        )}
                      </form.AppField>
                      {warning && (
                        <p role='status' className='text-muted-foreground text-sm'>
                          {warning}
                        </p>
                      )}
                    </>
                  )}
                />
              </>
            )}
          </form.Subscribe>
          <form.AppField name='year'>
            {(field) => (
              <field.ComboboxField
                label='Рік'
                required
                placeholder='Виберіть рік'
                searchPlaceholder='Введіть рік…'
                searchInputMode='numeric'
                options={options(YEAR_OPTIONS)}
                recentValues={recent(
                  data.vehicles.flatMap((vehicle) => (vehicle.year ? [String(vehicle.year)] : []))
                )}
              />
            )}
          </form.AppField>
          {!customer && (
            <form.AppField name='customerId'>
              {(field) => (
                <field.ComboboxField
                  label='Клієнт (необов’язково)'
                  disabled={linked}
                  placeholder='Без клієнта'
                  searchPlaceholder='Ім’я або телефон…'
                  options={[
                    { value: '', label: 'Без клієнта' },
                    ...customerChoices(data.customers)
                  ]}
                />
              )}
            </form.AppField>
          )}
          {customer && <p className='text-muted-foreground text-sm'>Клієнт: {customer.name}</p>}
          <form.AppField name='plate'>
            {(field) => <field.TextField label='Держномер (необов’язково)' />}
          </form.AppField>
          <FormActions
            pending={mutation.isPending}
            error={mutation.error}
            onCancel={onCancel}
            label={vehicle ? 'Зберегти зміни' : 'Додати автомобіль'}
          />
        </FieldGroup>
      </fieldset>
    </CrmForm>
  );
}

interface ModelFieldProps {
  make: string;
  data: CrmWorkspace;
  value: string;
  render: (
    choices: { value: string; label: string }[],
    warning: string | null,
    pending: boolean,
    failed: boolean,
    retry: () => void
  ) => React.ReactNode;
}
function ModelField({ make, data, value, render }: ModelFieldProps) {
  const catalog = useQuery({ ...crmQueries.catalog(make), enabled: !!make });
  return render(
    make
      ? options([
          ...(catalog.data?.models ?? []),
          ...data.vehicles
            .filter((vehicle) => vehicle.make.toUpperCase() === make)
            .map((vehicle) => vehicle.model),
          value
        ])
      : [],
    catalog.data?.warning ?? null,
    catalog.isFetching,
    catalog.isError,
    () => void catalog.refetch()
  );
}
