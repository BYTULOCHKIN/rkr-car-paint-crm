'use client';

import { useId } from 'react';
import { Field, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field';
import { useFieldContext, useFieldInvalid } from '@/lib/form-context';
import type { StockTag } from '../constants/tags';
import { StockTagPicker } from './tag-picker';

export function StockTagsField({ disabled = false }: { disabled?: boolean }) {
  const field = useFieldContext<StockTag[]>();
  const invalid = useFieldInvalid();
  const id = useId();
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  return (
    <Field data-invalid={invalid} data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={id}>Теги *</FieldLabel>
      <StockTagPicker
        value={field.state.value}
        onChange={field.handleChange}
        disabled={disabled}
        name={field.name}
        onBlur={field.handleBlur}
        inputProps={{
          id,
          'aria-required': true,
          'aria-invalid': invalid,
          'aria-describedby': invalid ? `${descriptionId} ${errorId}` : descriptionId
        }}
      />
      <FieldDescription id={descriptionId}>
        Оберіть один або кілька тегів із фіксованого списку.
      </FieldDescription>
      {invalid && <FieldError id={errorId} errors={field.state.meta.errors} />}
    </Field>
  );
}
