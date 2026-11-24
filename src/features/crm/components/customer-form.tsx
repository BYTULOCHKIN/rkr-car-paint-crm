'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppForm } from '@/lib/form';
import { Icons } from '@/components/icons';
import { FieldGroup, FieldError } from '@/components/ui/field';
import { customerEditorSchema } from '../schemas/crm';
import { customerContacts } from '../lib/customer-contacts';
import { phoneNumberError } from '@/lib/phone-number';
import type { Customer, CustomerContactValue } from '../api/types';
import { crmMutations, crmQueries } from '../api/queries';
import { CrmForm } from './dialog-form';
import { Button } from './action-button';
import { FormStatus, FormActions, type SaveProps } from './form-status';

interface CustomerFormProps extends SaveProps {
  customer?: Customer;
  orgId?: string;
}
function validatePhoneContact({ value }: { value: string }): { message: string } | undefined {
  const message = phoneNumberError(value);
  return message ? { message } : undefined;
}
export function CustomerForm({
  customer,
  orgId,
  onSaved,
  onCancel,
  onStateChange
}: CustomerFormProps) {
  const client = useQueryClient();
  const feedback = {
    onSuccess: () => {
      toast.success(customer ? 'Клієнта оновлено' : 'Клієнта створено');
      onSaved();
    },
    onSettled: () => client.invalidateQueries({ queryKey: crmQueries.all() })
  };
  const create = useMutation({ ...crmMutations.customer(), ...feedback });
  const update = useMutation({ ...crmMutations.updateCustomer(), ...feedback });
  const mutation = customer ? update : create;
  const form = useAppForm({
    defaultValues: {
      name: customer?.name ?? '',
      contacts: (customer
        ? customerContacts(customer).map(({ type, value }) => ({ type, value }))
        : [{ type: 'phone', value: '' }]) as CustomerContactValue[],
      notes: customer?.notes ?? ''
    },
    validators: { onSubmit: customerEditorSchema },
    onSubmit: async ({ value }) => {
      if (customer)
        await update
          .mutateAsync({
            ...value,
            id: customer.id,
            expectedRevision: customer.revision ?? 0,
            orgId: orgId ?? ''
          })
          .catch(() => undefined);
      else
        await create.mutateAsync({ ...value, ...(orgId ? { orgId } : {}) }).catch(() => undefined);
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
          <form.Field name='contacts' mode='array'>
            {(array) => (
              <FieldGroup className='gap-3'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <h3 className='text-sm font-semibold'>Контакти</h3>
                  <span className='text-xs text-muted-foreground'>
                    Хоча б один телефон або email
                  </span>
                </div>
                {array.state.value.map((contact, index) => (
                  <div key={index} className='flex min-w-0 items-start gap-2 rounded-lg border p-3'>
                    <div className='min-w-0 flex-1'>
                      <form.AppField
                        name={`contacts[${index}].value`}
                        validators={
                          contact.type === 'phone'
                            ? {
                                onBlur: validatePhoneContact,
                                onChange: validatePhoneContact
                              }
                            : undefined
                        }
                      >
                        {(field) =>
                          contact.type === 'phone' ? (
                            <field.PhoneField label={`Телефон ${index + 1}`} required />
                          ) : (
                            <field.TextField
                              label={`Email ${index + 1}`}
                              type='email'
                              required
                              autoComplete='email'
                              maxLength={254}
                            />
                          )
                        }
                      </form.AppField>
                    </div>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon-sm'
                      className='mt-6 shrink-0'
                      aria-label={`Видалити контакт ${index + 1}`}
                      disabled={array.state.value.length === 1}
                      onClick={() => array.removeValue(index)}
                    >
                      <Icons.trash aria-hidden />
                    </Button>
                  </div>
                ))}
                <FieldError errors={array.state.meta.errors} />
                <div className='flex flex-wrap gap-2'>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={array.state.value.length >= 20}
                    onClick={() => array.pushValue({ type: 'phone', value: '' })}
                  >
                    <span className='flex items-center gap-2'>
                      <Icons.phone aria-hidden />
                      Додати телефон
                    </span>
                  </Button>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    disabled={array.state.value.length >= 20}
                    onClick={() => array.pushValue({ type: 'email', value: '' })}
                  >
                    <span className='flex items-center gap-2'>
                      <Icons.mail aria-hidden />
                      Додати email
                    </span>
                  </Button>
                </div>
              </FieldGroup>
            )}
          </form.Field>
          <form.AppField name='notes'>
            {(field) => <field.TextareaField label='Нотатки' />}
          </form.AppField>
          <FormActions
            pending={mutation.isPending}
            error={mutation.error}
            onCancel={onCancel}
            label={customer ? 'Зберегти клієнта' : 'Створити клієнта'}
          />
        </FieldGroup>
      </fieldset>
    </CrmForm>
  );
}
