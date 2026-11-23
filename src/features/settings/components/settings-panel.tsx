'use client';

import { useId } from 'react';
import { useTheme } from 'next-themes';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from '@/components/ui/sheet';
import { ThemeSelector } from '@/components/themes/theme-selector';
import { useThemeConfig } from '@/components/themes/active-theme';
import { DEFAULT_THEME } from '@/components/themes/theme.config';

const modes = [
  { value: 'light', label: 'Світлий' },
  { value: 'dark', label: 'Темний' },
  { value: 'system', label: 'Як у системі' }
];

export function SettingsPanel() {
  const { theme, setTheme } = useTheme();
  const { activeTheme, setActiveTheme } = useThemeConfig();
  const modeId = useId();

  function resetAppearance(): void {
    setActiveTheme(DEFAULT_THEME);
    setTheme('system');
  }

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            type='button'
            variant='ghost'
            size='icon'
            aria-label='Налаштування'
            title='Налаштування'
          />
        }
      >
        <Icons.settings aria-hidden />
      </SheetTrigger>
      <SheetContent className='data-[side=right]:w-full'>
        <SheetHeader className='pr-12'>
          <SheetTitle>Налаштування</SheetTitle>
          <SheetDescription>Налаштуйте зовнішній вигляд CRM.</SheetDescription>
        </SheetHeader>
        <div className='min-h-0 flex-1 overflow-y-auto px-4 pb-4'>
          <FieldSet>
            <FieldLegend>Оформлення</FieldLegend>
            <FieldDescription>
              Зміни застосовуються одразу та зберігаються у цьому браузері.
            </FieldDescription>
            <FieldGroup>
              <ThemeSelector />
              <Field>
                <FieldLabel htmlFor={modeId}>Режим відображення</FieldLabel>
                <Select
                  items={modes}
                  value={theme ?? 'system'}
                  onValueChange={(value) => {
                    if (value !== null) setTheme(value);
                  }}
                >
                  <SelectTrigger id={modeId} className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent align='start' alignItemWithTrigger={false}>
                    <SelectGroup>
                      {modes.map((mode) => (
                        <SelectItem key={mode.value} value={mode.value}>
                          {mode.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  «Як у системі» автоматично враховує світлий або темний режим вашого пристрою.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldSet>
        </div>
        <SheetFooter className='border-t'>
          <Button
            type='button'
            variant='outline'
            disabled={activeTheme === DEFAULT_THEME && (theme ?? 'system') === 'system'}
            onClick={resetAppearance}
          >
            Відновити стандартне оформлення
          </Button>
          <SheetClose render={<Button type='button' />}>Готово</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
