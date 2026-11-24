'use client';

import type { ComponentProps } from 'react';
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import {
  Combobox,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxValue,
  ComboboxTrigger,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  useComboboxAnchor
} from '@/components/ui/combobox';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import { CHOICE_POPUP_CLASS_NAME } from '@/components/forms/fields/choice-options';
import { stockTags, stockTagColors, type StockTag } from '../constants/tags';
import { StockTagBadge } from './tag-badge';

interface StockTagPickerProps {
  value: StockTag[];
  onChange: (tags: StockTag[]) => void;
  disabled?: boolean;
  name?: string;
  onBlur?: () => void;
  inputProps?: ComponentProps<typeof ComboboxChipsInput>;
}

export function StockTagPicker({
  value,
  onChange,
  disabled,
  name,
  onBlur,
  inputProps
}: StockTagPickerProps) {
  const anchor = useComboboxAnchor();
  return (
    <Combobox<StockTag, true>
      multiple
      items={stockTags}
      value={value}
      name={name}
      disabled={disabled}
      onValueChange={onChange}
      onOpenChange={(open) => {
        if (!open) onBlur?.();
      }}
      autoHighlight
    >
      <ComboboxChips
        ref={anchor}
        className='relative min-h-10 w-full min-w-0 gap-1.5 py-1.5 pr-10 has-data-[slot=combobox-chip]:pr-10'
        aria-label='Вибрані теги'
        aria-invalid={inputProps?.['aria-invalid']}
      >
        <ComboboxValue>
          {(tags: StockTag[]) =>
            tags.map((tag) => (
              <ComboboxChip
                key={tag}
                showRemove={false}
                aria-label={tag}
                aria-description='Натисніть Backspace або Delete, щоб прибрати тег'
                className='h-auto min-h-6 max-w-full gap-1 border-0 py-0.5'
                style={stockTagColors[tag]}
                data-stock-tag={tag}
              >
                <span className='min-w-0 truncate'>{tag}</span>
                <ComboboxPrimitive.ChipRemove
                  aria-label={`Прибрати тег ${tag}`}
                  disabled={disabled}
                  render={<Button type='button' variant='ghost' size='icon-xs' />}
                  className='size-5 shrink-0 text-current'
                >
                  <Icons.close />
                </ComboboxPrimitive.ChipRemove>
              </ComboboxChip>
            ))
          }
        </ComboboxValue>
        <ComboboxChipsInput
          placeholder='Знайти тег…'
          autoComplete='off'
          spellCheck={false}
          onBlur={onBlur}
          className='min-w-24 py-0.5'
          {...inputProps}
        />
        <ComboboxTrigger
          aria-label='Показати теги'
          render={<Button type='button' variant='ghost' size='icon-sm' />}
          className='absolute top-1/2 right-1 -translate-y-1/2'
        />
      </ComboboxChips>
      <ComboboxContent
        anchor={anchor}
        className={cn(CHOICE_POPUP_CLASS_NAME, 'flex min-h-0 flex-col')}
      >
        <ComboboxEmpty role='status'>Тегів не знайдено</ComboboxEmpty>
        <ComboboxList className='min-h-0 max-h-none overflow-y-auto'>
          {(tag: StockTag) => (
            <ComboboxItem key={tag} value={tag} className='min-h-9'>
              <StockTagBadge tag={tag} />
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
