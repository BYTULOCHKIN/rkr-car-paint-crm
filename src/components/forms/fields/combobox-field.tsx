'use client';

import { useId, useMemo, useState, type HTMLAttributes, type ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxTrigger,
  ComboboxContent,
  ComboboxInput,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty
} from '@/components/ui/combobox';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { useFieldContext, useFieldInvalid, type BaseFieldProps } from '@/lib/form-context';
import {
  CHOICE_POPUP_CLASS_NAME,
  choiceLabel,
  matchesChoice,
  splitRecentOptions,
  type ChoiceOption
} from './choice-options';

interface ComboboxFieldProps extends BaseFieldProps {
  options: ChoiceOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  searchInputMode?: HTMLAttributes<HTMLInputElement>['inputMode'];
  emptyMessage?: string;
  noResultsMessage?: string;
  disabled?: boolean;
  recentValues?: string[];
  loading?: boolean;
  loadingMessage?: string;
  errorMessage?: string;
  onRetry?: () => void;
  clearable?: boolean;
}

const NO_RECENT_VALUES: string[] = [];

interface ChoiceGroup {
  value: string;
  items: ChoiceOption[];
}

export function ComboboxField({
  label,
  description,
  required,
  options,
  placeholder = 'Виберіть значення',
  searchPlaceholder = 'Пошук…',
  searchInputMode,
  emptyMessage = 'Немає доступних варіантів',
  noResultsMessage = 'За вашим пошуком нічого не знайдено.',
  disabled = false,
  recentValues = NO_RECENT_VALUES,
  loading = false,
  loadingMessage = 'Завантаження…',
  errorMessage,
  onRetry,
  clearable = !required
}: ComboboxFieldProps): ReactElement {
  const field = useFieldContext<string>();
  const isInvalid = useFieldInvalid();
  const controlId = useId();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === field.state.value);
  const selectedLabel = selected ? choiceLabel(selected) : '';
  const hasOptions = options.some((option) => !option.disabled);
  const isDisabled = disabled || !hasOptions;
  const help = disabled
    ? description || (!hasOptions ? emptyMessage : undefined)
    : errorMessage || (loading ? loadingMessage : !hasOptions ? emptyMessage : description);
  const describedBy =
    [help && `${controlId}-description`, isInvalid && `${controlId}-error`]
      .filter(Boolean)
      .join(' ') || undefined;
  const groups = useMemo<ChoiceGroup[]>(() => {
    const { recent, remaining } = splitRecentOptions(options, recentValues);
    return [
      ...(recent.length ? [{ value: 'Останні використані', items: recent }] : []),
      { value: recent.length ? 'Усі інші' : '', items: remaining }
    ];
  }, [options, recentValues]);

  return (
    <Field data-invalid={isInvalid} data-disabled={isDisabled || undefined}>
      <FieldLabel id={`${controlId}-label`} htmlFor={controlId}>
        {label}
        {required && ' *'}
      </FieldLabel>
      <Combobox<ChoiceOption>
        name={field.name}
        items={groups}
        value={selected ?? null}
        isItemEqualToValue={(option, value) => option.value === value.value}
        itemToStringLabel={choiceLabel}
        itemToStringValue={(option) => option.value}
        filter={matchesChoice}
        disabled={isDisabled}
        open={open && !isDisabled}
        autoHighlight
        onValueChange={(option) => field.handleChange(option?.value ?? '')}
        onOpenChange={(open) => {
          setOpen(open);
          if (!open) field.handleBlur();
        }}
      >
        <ComboboxTrigger
          id={controlId}
          render={<Button type='button' variant='outline' />}
          className={cn('w-full min-w-0 justify-between', !selected && 'text-muted-foreground')}
          aria-labelledby={`${controlId}-label`}
          aria-required={required || undefined}
          aria-invalid={isInvalid}
          aria-describedby={describedBy}
          aria-busy={loading || undefined}
          onBlur={field.handleBlur}
        >
          <span className='min-w-0 flex-1 truncate text-left' title={selectedLabel || undefined}>
            {selectedLabel || (!hasOptions && !disabled ? help : placeholder)}
          </span>
        </ComboboxTrigger>
        <ComboboxContent
          aria-labelledby={`${controlId}-label`}
          className={cn(
            CHOICE_POPUP_CLASS_NAME,
            'flex min-h-[min(120px,var(--available-height))] min-w-0 flex-col'
          )}
        >
          <ComboboxInput
            className='shrink-0'
            aria-label={`Пошук: ${label}`}
            placeholder={searchPlaceholder}
            inputMode={searchInputMode}
            showTrigger={false}
            autoComplete='off'
            spellCheck={false}
          />
          <ComboboxEmpty className='min-h-0 flex-1 items-center px-3 py-4' role='status'>
            {noResultsMessage}
          </ComboboxEmpty>
          <ComboboxList className='min-h-0 max-h-none flex-1 overflow-x-hidden [scrollbar-gutter:stable] [scrollbar-width:thin] [&::-webkit-scrollbar]:block [&::-webkit-scrollbar]:w-1.5'>
            {(group: ChoiceGroup) => (
              <ComboboxGroup key={group.value} items={group.items}>
                {group.value && <ComboboxLabel>{group.value}</ComboboxLabel>}
                <ComboboxCollection>
                  {(option: ChoiceOption) => (
                    <ComboboxItem
                      key={option.value}
                      value={option}
                      disabled={option.disabled}
                      className='min-h-9 items-start py-2'
                    >
                      <span className='flex min-w-0 flex-1 flex-col gap-0.5 text-left whitespace-normal [overflow-wrap:anywhere]'>
                        <span>{option.label}</span>
                        {option.description && (
                          <span className='text-xs text-muted-foreground'>
                            {option.description}
                          </span>
                        )}
                      </span>
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
          {clearable && field.state.value && (
            <div className='shrink-0 border-t p-1'>
              <Button
                type='button'
                variant='ghost'
                className='w-full justify-start'
                onClick={() => {
                  field.handleChange('');
                  field.handleBlur();
                  setOpen(false);
                }}
              >
                <Icons.close data-icon='inline-start' />
                Очистити вибір
              </Button>
            </div>
          )}
        </ComboboxContent>
      </Combobox>
      {help && (
        <FieldDescription
          id={`${controlId}-description`}
          role={errorMessage && !disabled ? 'alert' : undefined}
          aria-live={loading ? 'polite' : undefined}
        >
          {loading && !disabled && <Icons.spinner className='mr-1 inline size-3 animate-spin' />}
          {help}
          {errorMessage && !disabled && onRetry && (
            <Button
              type='button'
              variant='link'
              size='sm'
              className='ml-1 h-auto p-0'
              disabled={loading}
              onClick={onRetry}
            >
              Повторити
            </Button>
          )}
        </FieldDescription>
      )}
      {isInvalid && <FieldError id={`${controlId}-error`} errors={field.state.meta.errors} />}
    </Field>
  );
}
