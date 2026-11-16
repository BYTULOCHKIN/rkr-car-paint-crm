'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { uk } from 'date-fns/locale';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useFieldContext, useFieldInvalid, type BaseFieldProps } from '@/lib/form-context';
import { cn } from '@/lib/utils';

interface CalendarDateFieldProps extends BaseFieldProps {
  disabled?: boolean;
  min?: string;
  max?: string;
}

/** Calendar dates stay YYYY-MM-DD strings, without a UTC conversion. */
export function CalendarDateField({
  label,
  description,
  required,
  disabled,
  min,
  max
}: CalendarDateFieldProps) {
  const field = useFieldContext<string>();
  const isInvalid = useFieldInvalid();
  const [open, setOpen] = useState(false);
  const [endMonth] = useState(() => new Date(new Date().getFullYear() + 10, 11));
  const selected = field.state.value ? parseISO(field.state.value) : undefined;
  const descriptionId = description ? `${field.name}-description` : undefined;
  const errorId = isInvalid ? `${field.name}-error` : undefined;

  return (
    <Field data-invalid={isInvalid} data-disabled={disabled}>
      <FieldLabel htmlFor={field.name}>
        {label}
        {required && ' *'}
      </FieldLabel>
      <Popover
        open={open && !disabled}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) field.handleBlur();
        }}
      >
        <PopoverTrigger
          id={field.name}
          disabled={disabled}
          render={
            <Button
              type='button'
              variant='outline'
              onBlur={field.handleBlur}
              aria-invalid={isInvalid}
              aria-required={required}
              aria-describedby={[descriptionId, errorId].filter(Boolean).join(' ') || undefined}
              className={cn(
                'w-full justify-start font-normal',
                !selected && 'text-muted-foreground'
              )}
            />
          }
        >
          <Icons.calendar data-icon='inline-start' />
          {selected ? format(selected, 'dd.MM.yyyy') : 'Оберіть дату'}
        </PopoverTrigger>
        <PopoverContent align='start' className='w-auto p-0' aria-label={label}>
          <Calendar
            mode='single'
            required={required}
            endMonth={endMonth}
            locale={uk}
            captionLayout='dropdown'
            defaultMonth={selected}
            selected={selected}
            disabled={(date) => {
              const value = format(date, 'yyyy-MM-dd');
              return !!((min && value < min) || (max && value > max));
            }}
            onSelect={(date: Date | undefined) => {
              field.handleChange(date ? format(date, 'yyyy-MM-dd') : '');
              field.handleBlur();
              setOpen(false);
            }}
          />
          {!required && selected && (
            <Button
              type='button'
              variant='ghost'
              onClick={() => {
                field.handleChange('');
                field.handleBlur();
                setOpen(false);
              }}
            >
              Очистити дату
            </Button>
          )}
        </PopoverContent>
      </Popover>
      {description && <FieldDescription id={descriptionId}>{description}</FieldDescription>}
      {isInvalid && <FieldError id={errorId} errors={field.state.meta.errors} />}
    </Field>
  );
}
