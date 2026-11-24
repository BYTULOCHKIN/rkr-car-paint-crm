'use client';
import { CrmForm } from './dialog-form';
import { CustomerSelect } from './customer-select';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useAppForm } from '@/lib/form';
import { FieldGroup } from '@/components/ui/field';
import { crmMutations, crmQueries } from '../api/queries';
import type { CrmWorkspace, Vehicle } from '../api/types';
import { FormStatus, FormActions, type SaveProps } from './form-status';

export function VehicleOwnerForm({
  vehicle,
  data,
  onSaved,
  onCancel,
  onStateChange
}: SaveProps & { vehicle: Vehicle; data: CrmWorkspace }) {
  const client = useQueryClient();
  const mutation = useMutation({
    ...crmMutations.assignVehicle(),
    onSuccess: onSaved,
    onSettled: () => client.invalidateQueries({ queryKey: crmQueries.all() })
  });
  const form = useAppForm({
    defaultValues: { id: vehicle.id, customerId: '' },
    validators: { onSubmit: z.object({ id: z.uuid(), customerId: z.uuid('Виберіть клієнта') }) },
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
      <FieldGroup>
        <form.AppField name='customerId'>{() => <CustomerSelect data={data} />}</form.AppField>
        <FormActions
          pending={mutation.isPending}
          error={mutation.error}
          onCancel={onCancel}
          label='Закріпити клієнта'
        />
      </FieldGroup>
    </CrmForm>
  );
}
