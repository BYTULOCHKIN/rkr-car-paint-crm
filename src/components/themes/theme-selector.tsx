'use client';

import { useThemeConfig } from '@/components/themes/active-theme';
import { useId } from 'react';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

import { Icons } from '../icons';
import { THEMES } from './theme.config';

export function ThemeSelector() {
  const { activeTheme, setActiveTheme } = useThemeConfig();
  const id = useId();

  return (
    <Field>
      <FieldLabel htmlFor={id}>Тема оформлення</FieldLabel>
      <Select
        items={THEMES.map((theme) => ({ value: theme.value, label: theme.name }))}
        value={activeTheme}
        onValueChange={(value) => {
          if (value !== null) setActiveTheme(value);
        }}
      >
        <SelectTrigger id={id} className='w-full'>
          <Icons.palette aria-hidden />
          <SelectValue placeholder='Оберіть тему' />
        </SelectTrigger>
        <SelectContent align='start' alignItemWithTrigger={false}>
          {THEMES.length > 0 && (
            <>
              <SelectGroup>
                <SelectLabel>Теми</SelectLabel>
                {THEMES.map((theme) => (
                  <SelectItem key={theme.name} value={theme.value}>
                    {theme.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </>
          )}
        </SelectContent>
      </Select>
    </Field>
  );
}
