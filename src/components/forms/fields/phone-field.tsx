'use client';

import { useId, type ReactElement } from 'react';
import { Icons } from '@/components/icons';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { useFieldContext, useFieldInvalid, type BaseFieldProps } from '@/lib/form-context';
import { formatCustomerPhone, phoneCountryFlag, phoneCountryInfo } from '@/lib/phone-number';

export function PhoneField({ label, required, description }: BaseFieldProps): ReactElement {
  const field = useFieldContext<string>();
  const invalid = useFieldInvalid();
  const id = useId();
  const info = phoneCountryInfo(field.state.value);
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>
        {label}
        {required && ' *'}
      </FieldLabel>
      <InputGroup>
        <InputGroupAddon aria-hidden='true'>
          {info.country ? <span>{phoneCountryFlag(info.country)}</span> : <Icons.phone />}
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          name={field.name}
          type='tel'
          inputMode='tel'
          autoComplete='tel'
          placeholder='+380 50 123 45 67'
          maxLength={40}
          value={field.state.value}
          onChange={(event) => field.handleChange(event.target.value)}
          onBlur={() => {
            const formatted = formatCustomerPhone(field.state.value);
            if (formatted !== field.state.value) field.handleChange(formatted);
            field.handleBlur();
          }}
          aria-required={required || undefined}
          aria-invalid={invalid}
          aria-describedby={[
            `${id}-country`,
            description && `${id}-description`,
            invalid && `${id}-error`
          ]
            .filter(Boolean)
            .join(' ')}
        />
      </InputGroup>
      <FieldDescription id={`${id}-country`} aria-live='polite' aria-atomic='true'>
        {info.label}
      </FieldDescription>
      {description && <FieldDescription id={`${id}-description`}>{description}</FieldDescription>}
      {invalid && <FieldError id={`${id}-error`} errors={field.state.meta.errors} />}
    </Field>
  );
}
