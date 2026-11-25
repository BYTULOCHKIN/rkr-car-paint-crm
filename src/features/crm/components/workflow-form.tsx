'use client';
import { CrmForm } from './dialog-form';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppForm } from '@/lib/form';
import { useStore } from '@tanstack/react-form';
import { FieldGroup } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { crmMutations, crmQueries } from '../api/queries';
import type { BoardStatus, WorkflowRecord } from '../api/types';
import { workflowSchema, type WorkflowInput } from '../schemas/crm';
import { businessToday, WORKFLOW_COLUMNS, REQUEST_COLUMNS } from '../lib/workflow';
import { FormActions, FormStatus, type SaveProps } from './form-status';
import { workflowChangeReason } from '../lib/workflow-change-reason';

interface WorkflowFormProps extends SaveProps {
  disabled?: boolean;
  target: WorkflowRecord;
  requestedStatus?: BoardStatus;
}

export function WorkflowForm({
  target,
  disabled = false,
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
    onError: (error) => toast.error(error.message),
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
      expectedRevision: target.record.workflowRevision ?? 0,
      status,
      plannedIntakeDate: status === 'backlog' ? '' : (target.record.plannedIntakeDate ?? ''),
      plannedDeliveryDate: target.record.plannedDeliveryDate ?? '',
      actualIntakeDate:
        order?.actualIntakeDate ||
        (target.kind === 'order' && status !== 'created' ? businessToday() : ''),
      actualReadyDate: status === 'ready' ? order?.actualReadyDate || businessToday() : '',
      actualDeliveryDate: status === 'ready' ? order?.actualDeliveryDate || '' : '',
      note: ''
    } as WorkflowInput,
    validators: {
      onSubmit: workflowSchema.superRefine((value, context) => {
        const message = workflowChangeReason(target, value);
        if (message && !value.note) context.addIssue({ code: 'custom', path: ['note'], message });
      })
    },
    onSubmit: async ({ value }) => {
      await mutation.mutateAsync(value).catch(() => undefined);
    }
  });
  const reason = useStore(form.store, (state) => workflowChangeReason(target, state.values));
  const options = target.kind === 'request' ? REQUEST_COLUMNS : WORKFLOW_COLUMNS;
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
      <fieldset disabled={mutation.isPending || disabled} className='min-w-0'>
        <FieldGroup>
          <form.AppField
            name='status'
            listeners={{
              onChange: ({ value }) => {
                if (value === 'backlog') form.setFieldValue('plannedIntakeDate', '');
                if (target.kind === 'order') {
                  if (value !== 'created' && !form.getFieldValue('actualIntakeDate'))
                    form.setFieldValue('actualIntakeDate', businessToday());
                  form.setFieldValue(
                    'actualReadyDate',
                    value === 'ready'
                      ? form.getFieldValue('actualReadyDate') || businessToday()
                      : ''
                  );
                  form.setFieldValue(
                    'actualDeliveryDate',
                    value === 'ready' ? order?.actualDeliveryDate || '' : ''
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
              завершили роботи. Запізнення не переписує план.
            </AlertDescription>
          </Alert>
          <FieldGroup className='grid gap-4 sm:grid-cols-2'>
            <form.Subscribe selector={(state) => state.values.status}>
              {(current) => (
                <form.AppField name='plannedIntakeDate'>
                  {(field) => (
                    <field.CalendarDateField
                      label='Запланований прийом'
                      disabled={current === 'backlog'}
                      required={current === 'scheduled'}
                    />
                  )}
                </form.AppField>
              )}
            </form.Subscribe>
            <form.AppField name='plannedDeliveryDate'>
              {(field) => <field.CalendarDateField label='Запланована видача' />}
            </form.AppField>
          </FieldGroup>
          {target.kind === 'order' && (
            <>
              <form.Subscribe selector={(state) => state.values.status}>
                {(current) => (
                  <form.AppField name='actualIntakeDate'>
                    {(field) => (
                      <field.CalendarDateField
                        label='Фактичний прийом'
                        required={current !== 'created'}
                        max={businessToday()}
                      />
                    )}
                  </form.AppField>
                )}
              </form.Subscribe>
              <form.Subscribe selector={(state) => state.values.status}>
                {(current) => (
                  <>
                    {current === 'ready' && (
                      <form.AppField name='actualReadyDate'>
                        {(field) => (
                          <field.CalendarDateField
                            label='Фактична готовність'
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
                required={!!reason}
                aria-required={!!reason}
                description={
                  reason
                    ? `${reason}. Потрапить в історію.`
                    : 'Для зміни наявного плану, виправлення фактичної дати чи повернення статусу потрібна причина. Потрапить в історію.'
                }
              />
            )}
          </form.AppField>
          <FormActions
            pending={mutation.isPending}
            disabled={disabled}
            error={mutation.error}
            onCancel={onCancel}
            label='Зберегти статус і дати'
          />
        </FieldGroup>
      </fieldset>
    </CrmForm>
  );
}
