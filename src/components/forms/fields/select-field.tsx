'use client';

import { useId } from 'react';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { useFieldContext, useFieldInvalid, type BaseFieldProps } from '@/lib/form-context';
import { CHOICE_POPUP_CLASS_NAME, splitRecentOptions, type ChoiceOption } from './choice-options';

export function SelectField({
  label,
  description,
  required,
  placeholder = 'Виберіть значення',
  options,
  disabled = false,
  emptyMessage = 'Немає доступних варіантів',
  recentValues = []
}: BaseFieldProps & {
  placeholder?: string;
  options: ChoiceOption[];
  disabled?: boolean;
  emptyMessage?: string;
  recentValues?: string[];
}) {
  const field = useFieldContext<string>();
  const isInvalid = useFieldInvalid();
  const { recent, remaining } = splitRecentOptions(options, recentValues);
  const controlId = useId();
  const hasOptions = options.some((option) => !option.disabled);
  const isDisabled = disabled || !hasOptions;
  const help = !hasOptions ? emptyMessage : description;
  const describedBy =
    [help && `${controlId}-description`, isInvalid && `${controlId}-error`]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <Field data-invalid={isInvalid} data-disabled={isDisabled || undefined}>
      <FieldLabel htmlFor={controlId}>
        {label}
        {required && ' *'}
      </FieldLabel>
      <Select
        name={field.name}
        items={options}
        value={field.state.value || null}
        disabled={isDisabled}
        onValueChange={(value) => field.handleChange(value ?? '')}
        onOpenChange={(open) => {
          if (!open) field.handleBlur();
        }}
      >
        <SelectTrigger
          id={controlId}
          className='w-full min-w-0'
          onBlur={field.handleBlur}
          aria-required={required || undefined}
          aria-invalid={isInvalid}
          aria-describedby={describedBy}
        >
          <SelectValue
            className='min-w-0 truncate'
            placeholder={isDisabled ? (disabled ? placeholder : emptyMessage) : placeholder}
          />
        </SelectTrigger>
        <SelectContent
          align='start'
          alignItemWithTrigger={false}
          className={CHOICE_POPUP_CLASS_NAME}
        >
          {recent.length > 0 && (
            <SelectGroup>
              <SelectLabel>Останні використані</SelectLabel>
              {recent.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  className='[&>span:first-child]:min-w-0 [&>span:first-child]:shrink'
                >
                  <span className='min-w-0 whitespace-normal [overflow-wrap:anywhere]'>
                    {opt.label}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          <SelectGroup>
            {recent.length > 0 && <SelectLabel>Усі інші</SelectLabel>}
            {remaining.map((opt) => (
              <SelectItem
                key={opt.value}
                value={opt.value}
                disabled={opt.disabled}
                className='[&>span:first-child]:min-w-0 [&>span:first-child]:shrink'
              >
                <span className='min-w-0 whitespace-normal [overflow-wrap:anywhere]'>
                  {opt.label}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {help && <FieldDescription id={`${controlId}-description`}>{help}</FieldDescription>}
      {isInvalid && <FieldError id={`${controlId}-error`} errors={field.state.meta.errors} />}
    </Field>
  );
}
