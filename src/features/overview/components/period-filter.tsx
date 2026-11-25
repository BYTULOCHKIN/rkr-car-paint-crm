'use client';

import type { ReactElement } from 'react';
import { useAppForm } from '@/lib/form';
import { FieldGroup } from '@/components/ui/field';
import { Button } from '@/features/crm/components/action-button';
import { overviewPeriodSchema, type OverviewPeriod } from '../schemas/period';
import { currentOverviewMonth, previousOverviewMonth } from '../lib/period';

export function OverviewPeriodFilter({
  period,
  today,
  onApply
}: {
  period: OverviewPeriod;
  today: string;
  onApply: (period: OverviewPeriod) => void;
}): ReactElement {
  const form = useAppForm({
    defaultValues: period,
    validators: { onSubmit: overviewPeriodSchema },
    onSubmit: ({ value }) => onApply(value)
  });
  const current = currentOverviewMonth(today),
    previous = previousOverviewMonth(today);
  const selected = (range: OverviewPeriod) => range.from === period.from && range.to === period.to;
  return (
    <form
      aria-label='Період огляду'
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FieldGroup className='grid grid-cols-2 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'>
        <form.AppField name='from'>
          {(field) => <field.TextField type='date' label='Початок періоду' required />}
        </form.AppField>
        <form.AppField name='to'>
          {(field) => <field.TextField type='date' label='Кінець періоду' required />}
        </form.AppField>
        <div className='col-span-2 flex flex-wrap items-center gap-2 xl:col-span-1 xl:self-end'>
          <Button type='submit'>Показати огляд</Button>
          <Button
            type='button'
            variant={selected(current) ? 'secondary' : 'outline'}
            aria-pressed={selected(current)}
            onClick={() => onApply(current)}
          >
            Поточний місяць
          </Button>
          <Button
            type='button'
            variant={selected(previous) ? 'secondary' : 'outline'}
            aria-pressed={selected(previous)}
            onClick={() => onApply(previous)}
          >
            Минулий місяць
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}
