'use client';

import { useEffect, useState, useId } from 'react';
import { DialogActions } from '@/features/crm/components/dialog-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppForm } from '@/lib/form';
import { FieldGroup } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/features/crm/components/action-button';
import { FormStatus, type FormState } from '@/features/crm/components/form-status';
import type { RepairOrder, TeamMember } from '@/features/crm/api/types';
import type { OrderEconomicsDetails } from '../api/types';
import { crmQueries } from '@/features/crm/api/queries';
import { economicsMutations } from '../api/queries';
import {
  detailedCheckFormSchema,
  formToEconomics,
  initialDetailedCheck,
  formLineTotalCents
} from '../schemas/form';
import { workKindOptions } from '../lib/details';
import { money } from '@/features/crm/lib/format';
import { specialtyWorkerOptions } from '@/features/crm/lib/team-specialties';

interface DetailedCheckFormProps {
  order: RepairOrder;
  team: TeamMember[];
  orgId: string;
  onCancel: () => void;
  onSaved: () => void;
  onStateChange?: (state: FormState) => void;
  prepareCorrection?: (details: OrderEconomicsDetails) => Promise<void>;
  disabled?: boolean;
  footerActions?: boolean;
}

export default function DetailedCheckForm({
  order,
  team,
  orgId,
  onCancel,
  onSaved,
  onStateChange,
  prepareCorrection,
  disabled = false,
  footerActions = false
}: DetailedCheckFormProps) {
  const [defaults] = useState(() => initialDetailedCheck(order));
  const [expectedRevision] = useState(order.workflowRevision ?? 0);
  const [showAllWorkers, setShowAllWorkers] = useState(false);
  const specialtiesConfigured = team.some((member) => member.specialties?.length);
  const formId = useId();
  const client = useQueryClient();
  const mutation = useMutation({
    ...economicsMutations.save(),
    onSuccess: () => {
      toast.success('Деталізований чек збережено');
    },
    onSettled: () => client.invalidateQueries({ queryKey: crmQueries.all() })
  });
  useEffect(() => () => onStateChange?.({ dirty: false, pending: false }), [onStateChange]);
  const form = useAppForm({
    defaultValues: defaults,
    validators: { onSubmit: detailedCheckFormSchema },
    onSubmit: async ({ value }) => {
      if (prepareCorrection) {
        await prepareCorrection(formToEconomics(value));
        return;
      }
      try {
        await mutation.mutateAsync({
          orgId,
          orderId: order.id,
          expectedRevision,
          details: formToEconomics(value)
        });
        onSaved();
      } catch {
        /* Keep the draft and show the mutation error. */
      }
    }
  });
  return (
    <form
      id={formId}
      aria-label='Редагування деталізованого чека'
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => <FormStatus dirty pending={pending} onChange={onStateChange} />}
      </form.Subscribe>
      <fieldset disabled={mutation.isPending || disabled} className='min-w-0'>
        <FieldGroup>
          <p className='text-muted-foreground text-sm'>
            Ціни в гривнях. Полірування входить у фарбування. Матеріали списуються на все авто. Один
            виконавець на кожен вид робіт.
          </p>
          {specialtiesConfigured ? (
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={() => setShowAllWorkers((current) => !current)}
            >
              {showAllWorkers ? 'Лише за спеціалізацією' : 'Показати всіх працівників'}
            </Button>
          ) : (
            <p className='text-sm text-muted-foreground'>
              Спеціалізації ще не задані. Доступна вся команда.
            </p>
          )}
          {(['painter', 'polisher', 'assembler'] as const).map((role) => {
            const labels = { painter: 'Маляр', polisher: 'Полірувальник', assembler: 'Розбірник' };
            return (
              <form.AppField key={role} name={`${role}Id`}>
                {(field) => (
                  <field.ComboboxField
                    label={labels[role]}
                    placeholder='Не призначено'
                    emptyMessage='Немає працівників цієї спеціалізації. Натисніть «Показати всіх працівників».'
                    description={
                      specialtiesConfigured && !showAllWorkers
                        ? 'Працівники за спеціалізацією та поточний виконавець.'
                        : undefined
                    }
                    options={specialtyWorkerOptions(
                      team,
                      role,
                      field.state.value,
                      order.economics?.[`${role}Name`],
                      showAllWorkers
                    )}
                  />
                )}
              </form.AppField>
            );
          })}
          <form.AppField name='share'>
            {(field) => (
              <field.TextField
                label='Ставка працівників, %'
                inputMode='decimal'
                required
                description='Застосовується до бази кожного виду робіт. Колористу та іншим підрядникам виплачується погоджена сума.'
              />
            )}
          </form.AppField>
          <form.Field name='lines' mode='array'>
            {(array) => (
              <FieldGroup>
                {array.state.value.map((initialLine, index) => (
                  <form.Subscribe
                    key={initialLine.id}
                    selector={(state) => state.values.lines[index]}
                  >
                    {(line) =>
                      line ? (
                        <fieldset className='flex min-w-0 flex-col gap-3 rounded-lg border p-3'>
                          <legend className='px-1 text-sm font-medium'>Позиція {index + 1}</legend>
                          <form.AppField
                            name={`lines[${index}].kind`}
                            listeners={{
                              onChange: ({ value }) => {
                                if (
                                  ['color_matching', 'soldering', 'other'].includes(value) &&
                                  !['color_matching', 'soldering', 'other'].includes(line.kind)
                                )
                                  form.setFieldValue(
                                    `lines[${index}].subcontractCost`,
                                    (formLineTotalCents(line.price, line.quantity) / 100).toFixed(2)
                                  );
                                if (value !== 'painting')
                                  form.setFieldValue(`lines[${index}].polishing`, '0');
                                if (value === 'painting' || value === 'assembly') {
                                  form.setFieldValue(`lines[${index}].contractorName`, '');
                                  form.setFieldValue(`lines[${index}].subcontractCost`, '0');
                                }
                              }
                            }}
                          >
                            {(field) => (
                              <field.SelectField
                                label={`Вид роботи ${index + 1}`}
                                required
                                options={[
                                  { value: 'unclassified', label: 'Оберіть вид роботи' },
                                  ...workKindOptions
                                ]}
                              />
                            )}
                          </form.AppField>
                          <form.AppField name={`lines[${index}].description`}>
                            {(field) => (
                              <field.TextField label={`Назва роботи ${index + 1}`} required />
                            )}
                          </form.AppField>
                          <FieldGroup className='grid grid-cols-2 gap-3'>
                            <form.AppField
                              name={`lines[${index}].quantity`}
                              listeners={{
                                onChange: ({ value }) => {
                                  if (
                                    ['soldering', 'other'].includes(line.kind) &&
                                    formLineTotalCents(line.subcontractCost, 1) ===
                                      formLineTotalCents(line.price, line.quantity)
                                  )
                                    form.setFieldValue(
                                      `lines[${index}].subcontractCost`,
                                      (formLineTotalCents(line.price, value) / 100).toFixed(2)
                                    );
                                }
                              }}
                            >
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
                            <form.AppField
                              name={`lines[${index}].price`}
                              listeners={{
                                onChange: ({ value }) => {
                                  if (
                                    ['soldering', 'other'].includes(line.kind) &&
                                    formLineTotalCents(line.subcontractCost, 1) ===
                                      formLineTotalCents(line.price, line.quantity)
                                  )
                                    form.setFieldValue(
                                      `lines[${index}].subcontractCost`,
                                      (formLineTotalCents(value, line.quantity) / 100).toFixed(2)
                                    );
                                }
                              }}
                            >
                              {(field) => (
                                <field.TextField
                                  label='Ціна за одиницю, грн'
                                  inputMode='decimal'
                                  required
                                />
                              )}
                            </form.AppField>
                          </FieldGroup>
                          {line.kind === 'painting' && (
                            <form.AppField name={`lines[${index}].polishing`}>
                              {(field) => (
                                <field.TextField
                                  label='З цієї суми полірування, грн'
                                  inputMode='decimal'
                                  required
                                  description='Внутрішня частина за всю позицію. Не додається до чека повторно.'
                                />
                              )}
                            </form.AppField>
                          )}
                          {['color_matching', 'soldering', 'other'].includes(line.kind) && (
                            <>
                              <form.AppField name={`lines[${index}].contractorName`}>
                                {(field) => <field.TextField label='Підрядник' required />}
                              </form.AppField>
                              {line.kind === 'color_matching' ? (
                                <p className='text-muted-foreground text-sm'>
                                  Уся ціна цієї позиції належить колористу.
                                </p>
                              ) : (
                                <form.AppField name={`lines[${index}].subcontractCost`}>
                                  {(field) => (
                                    <field.TextField
                                      label='Оплата підряднику, грн'
                                      inputMode='decimal'
                                      required
                                      description='Загальна погоджена сума підряднику за всю позицію.'
                                    />
                                  )}
                                </form.AppField>
                              )}
                            </>
                          )}
                          <Button
                            type='button'
                            variant='ghost'
                            disabled={array.state.value.length === 1}
                            onClick={() => array.removeValue(index)}
                          >
                            Видалити позицію {index + 1}
                          </Button>
                        </fieldset>
                      ) : null
                    }
                  </form.Subscribe>
                ))}
                <Button
                  type='button'
                  variant='outline'
                  disabled={array.state.value.length >= 100}
                  onClick={() =>
                    array.pushValue({
                      id: crypto.randomUUID(),
                      kind: 'unclassified',
                      description: '',
                      quantity: 1,
                      price: '0',
                      polishing: '0',
                      subcontractCost: '0',
                      contractorName: ''
                    })
                  }
                >
                  Додати роботу до чека
                </Button>
                {array.state.meta.errors.length > 0 && (
                  <Alert variant='destructive'>
                    <AlertDescription>
                      {array.state.meta.errors
                        .map((error) => (typeof error === 'string' ? error : error?.message))
                        .join('; ')}
                    </AlertDescription>
                  </Alert>
                )}
              </FieldGroup>
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.lines}>
            {(lines) => (
              <p className='text-right font-semibold'>
                Чек клієнта:{' '}
                {money(
                  lines.reduce(
                    (sum, line) => sum + formLineTotalCents(line.price, line.quantity),
                    0
                  )
                )}
              </p>
            )}
          </form.Subscribe>
          {mutation.error && (
            <Alert variant='destructive'>
              <AlertDescription>{mutation.error.message}</AlertDescription>
            </Alert>
          )}
          <FormActionLayout footer={footerActions}>
            <Button type='submit' form={formId} isLoading={mutation.isPending}>
              {prepareCorrection ? 'Переглянути коригування' : 'Зберегти деталізований чек'}
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={mutation.isPending}
              onClick={onCancel}
            >
              Скасувати деталізацію
            </Button>
          </FormActionLayout>
        </FieldGroup>
      </fieldset>
    </form>
  );
}

function FormActionLayout({ footer, children }: { footer: boolean; children: React.ReactNode }) {
  return footer ? (
    <DialogActions>{children}</DialogActions>
  ) : (
    <div className='flex flex-wrap gap-2'>{children}</div>
  );
}
