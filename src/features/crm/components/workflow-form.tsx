'use client';
import { CrmForm } from './dialog-form';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppForm } from '@/lib/form';
import { FieldGroup } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { crmMutations, crmQueries } from '../api/queries';
import type { BoardStatus, WorkflowRecord } from '../api/types';
import { workflowSchema, type WorkflowInput } from '../schemas/crm';
import { businessToday, WORKFLOW_COLUMNS } from '../lib/workflow';
import { FormActions, FormStatus, type SaveProps } from './form-status';

interface WorkflowFormProps extends SaveProps {
  target: WorkflowRecord;
  requestedStatus?: BoardStatus;
}

export function WorkflowForm({
  target,
  requestedStatus,
  onSaved,
  onCancel,
  onStateChange
}: WorkflowFormProps) {
  const client = useQueryClient();
  const mutation = useMutation({
    ...crmMutations.workflow(),
    onSuccess: () => {
      toast.success('Статус і дати збережено');
      onSaved();
    },
    onSettled: () => client.invalidateQueries({ queryKey: crmQueries.all() })
  });
  const status =
    requestedStatus ?? (target.record.status === 'converted' ? 'backlog' : target.record.status);
  const order = target.kind === 'order' ? target.record : null;
  const form = useAppForm({
    defaultValues: {
      kind: target.kind,
      id: target.record.id,
      expectedStatus: target.record.status,
      status,
      plannedIntakeDate: status === 'backlog' ? '' : (target.record.plannedIntakeDate ?? ''),
      plannedDeliveryDate: target.record.plannedDeliveryDate ?? '',
      actualIntakeDate: order?.actualIntakeDate ?? '',
      actualReadyDate: ['ready', 'delivered'].includes(status)
        ? order?.actualReadyDate || businessToday()
        : '',
      actualDeliveryDate:
        status === 'delivered' ? order?.actualDeliveryDate || businessToday() : '',
      note: ''
    } as WorkflowInput,
    validators: { onSubmit: workflowSchema },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value).catch(() => undefined);
    }
  });
  const options = WORKFLOW_COLUMNS.filter((column) =>
    target.kind === 'request'
      ? ['backlog', 'scheduled'].includes(column.value)
      : ['in_progress', 'ready', 'delivered'].includes(column.value)
  );
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
            name='status'
            listeners={{
              onChange: ({ value }) => {
                if (value === 'backlog') form.setFieldValue('plannedIntakeDate', '');
                if (target.kind === 'order') {
                  form.setFieldValue(
                    'actualReadyDate',
                    ['ready', 'delivered'].includes(value)
                      ? form.getFieldValue('actualReadyDate') || businessToday()
                      : ''
                  );
                  form.setFieldValue(
                    'actualDeliveryDate',
                    value === 'delivered'
                      ? form.getFieldValue('actualDeliveryDate') || businessToday()
                      : ''
                  );
                }
              }
            }}
          >
            {(field) => <field.SelectField label='Статус' required options={options} />}
          </form.AppField>
          <Alert>
            <AlertDescription>
              Заплановані дати — домовленість із клієнтом. Фактичні — коли авто дійсно прийняли,
              підготували та видали. Запізнення не переписує план.
            </AlertDescription>
          </Alert>
          <FieldGroup className='grid gap-4 sm:grid-cols-2'>
            <form.Subscribe selector={(state) => state.values.status}>
              {(current) => (
                <form.AppField name='plannedIntakeDate'>
                  {(field) => (
                    <field.TextField
                      type='date'
                      label='Запланований прийом'
                      disabled={current === 'backlog'}
                      required={current === 'scheduled'}
                    />
                  )}
                </form.AppField>
              )}
            </form.Subscribe>
            <form.AppField name='plannedDeliveryDate'>
              {(field) => <field.TextField type='date' label='Запланована видача' />}
            </form.AppField>
          </FieldGroup>
          {target.kind === 'order' && (
            <>
              <form.AppField name='actualIntakeDate'>
                {(field) => (
                  <field.TextField
                    type='date'
                    label='Фактичний прийом'
                    required
                    max={businessToday()}
                  />
                )}
              </form.AppField>
              <form.Subscribe selector={(state) => state.values.status}>
                {(current) => (
                  <>
                    {['ready', 'delivered'].includes(current) && (
                      <form.AppField name='actualReadyDate'>
                        {(field) => (
                          <field.TextField
                            type='date'
                            label='Фактична готовність'
                            required
                            max={businessToday()}
                          />
                        )}
                      </form.AppField>
                    )}
                    {current === 'delivered' && (
                      <form.AppField name='actualDeliveryDate'>
                        {(field) => (
                          <field.TextField
                            type='date'
                            label='Фактична видача'
                            required
                            max={businessToday()}
                          />
                        )}
                      </form.AppField>
                    )}
                  </>
                )}
              </form.Subscribe>
            </>
          )}
          <form.AppField name='note'>
            {(field) => (
              <field.TextareaField
                label='Примітка / причина перенесення'
                description='Обов’язкова для зміни наявного плану, виправлення фактичної дати чи повернення статусу. Потрапить в історію.'
              />
            )}
          </form.AppField>
          <FormActions
            pending={mutation.isPending}
            error={mutation.error}
            onCancel={onCancel}
            label='Зберегти статус і дати'
          />
        </FieldGroup>
      </fieldset>
    </CrmForm>
  );
}
