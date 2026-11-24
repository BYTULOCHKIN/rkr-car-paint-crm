'use client';

import { useId, useLayoutEffect, useRef, type ReactElement } from 'react';
import { Icons } from '@/components/icons';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { useFieldContext, useFieldInvalid, type BaseFieldProps } from '@/lib/form-context';
import {
  formatCustomerPhone,
  formatPhoneInputEdit,
  phoneCountryFlag,
  phoneCountryInfo,
  type PhoneInputEdit
} from '@/lib/phone-number';

export function PhoneField({ label, required, description }: BaseFieldProps): ReactElement {
  const field = useFieldContext<string>();
  const invalid = useFieldInvalid();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingSelection = useRef<PhoneInputEdit | null>(null);
  const info = phoneCountryInfo(field.state.value);
  useLayoutEffect(() => {
    const edit = pendingSelection.current;
    const input = inputRef.current;
    if (edit && input && document.activeElement === input && edit.value === field.state.value)
      input.setSelectionRange(edit.caret, edit.caret);
    pendingSelection.current = null;
  }, [field.state.value]);
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
          ref={inputRef}
          id={id}
          name={field.name}
          type='tel'
          inputMode='tel'
          autoComplete='tel'
          placeholder='+380 50 123 4567'
          maxLength={40}
          value={field.state.value}
          onKeyDown={(event) => {
            if (
              event.ctrlKey ||
              event.metaKey ||
              event.nativeEvent.isComposing ||
              event.key.length !== 1
            )
              return;
            const input = event.currentTarget;
            const leadingPlus =
              event.key === '+' &&
              input.selectionStart === 0 &&
              (!input.value.startsWith('+') || (input.selectionEnd ?? 0) > 0);
            if (!/^\d$/.test(event.key) && !leadingPlus) event.preventDefault();
          }}
          onChange={(event) => {
            const input = event.currentTarget;
            const edit = formatPhoneInputEdit(
              input.value,
              input.selectionStart ?? input.value.length,
              field.state.value,
              (event.nativeEvent as InputEvent).inputType
            );
            pendingSelection.current = edit.value === field.state.value ? null : edit;
            field.handleChange(edit.value);
            // Restore immediately as well: rejected input may leave form state unchanged.
            input.value = edit.value;
            input.setSelectionRange(edit.caret, edit.caret);
          }}
          onBlur={() => {
            pendingSelection.current = null;
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
