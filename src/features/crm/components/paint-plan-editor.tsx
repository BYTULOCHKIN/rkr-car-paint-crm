'use client';

import { useState, type ReactElement } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  bodyParts,
  paintModes,
  partLabel,
  paintModeLabel,
  type PaintMode,
  type PaintSelection
} from '../constants/paint-plan';
import { BodyDiagram } from './body-diagram';
import { PaintSwatch } from './paint-pattern';

interface PaintPlanEditorProps {
  value: PaintSelection[];
  disabled?: boolean;
  onChange: (value: PaintSelection[]) => void;
  onBlur: () => void;
}

export function PaintPlanEditor({
  value,
  onChange,
  onBlur,
  disabled
}: PaintPlanEditorProps): ReactElement {
  const [mode, setMode] = useState<PaintMode>('one_side');
  function togglePart(partId: string): void {
    const current = value.find((part) => part.partId === partId);
    const remaining = value.filter((part) => part.partId !== partId);
    onChange(current?.mode === mode ? remaining : [...remaining, { partId, mode }]);
    onBlur();
  }
  return (
    <FieldSet disabled={disabled} className='min-w-0 rounded-xl border bg-muted/20 p-3 sm:p-4'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <FieldLegend className='mb-0'>Схема фарбування кузова</FieldLegend>
        <Badge variant='secondary'>Деталей: {value.length}</Badge>
      </div>
      <FieldDescription>
        Виберіть спосіб фарбування та натисніть деталь. Повторне натискання з тим самим способом
        прибирає позначку. Роботи та ціни вводяться окремо нижче.
      </FieldDescription>
      <ToggleGroup
        variant='outline'
        value={[mode]}
        onValueChange={(values) => {
          if (values[0]) setMode(values[0] as PaintMode);
        }}
        className='w-full flex-wrap'
        aria-label='Спосіб фарбування'
      >
        {paintModes.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={option.label}
            className='h-auto min-w-24 flex-1 flex-col gap-1.5 py-2'
          >
            <PaintSwatch mode={option.value} />
            {option.short}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <BodyDiagram value={value} onPartClick={disabled ? undefined : togglePart} />
      <details className='rounded-lg border bg-background p-3'>
        <summary className='cursor-pointer text-sm font-medium'>Усі деталі списком</summary>
        <div className='mt-3 grid gap-2 sm:grid-cols-2'>
          {bodyParts.map((part, index) => (
            <Button
              key={part.id}
              type='button'
              variant={value.some((entry) => entry.partId === part.id) ? 'secondary' : 'outline'}
              aria-pressed={value.some((entry) => entry.partId === part.id)}
              onClick={() => togglePart(part.id)}
              className='h-auto justify-start py-2 text-left whitespace-normal'
            >
              {index + 1}. {part.label}
            </Button>
          ))}
        </div>
      </details>
      {value.length > 0 ? (
        <ul className='flex flex-col gap-2' aria-label='Позначені деталі'>
          {bodyParts
            .filter((part) => value.some((entry) => entry.partId === part.id))
            .map((part) => {
              const selection = value.find((entry) => entry.partId === part.id)!;
              return (
                <li
                  key={part.id}
                  className='flex items-center justify-between gap-3 rounded-lg border bg-background px-3 py-2 text-sm'
                >
                  <div>
                    <p className='font-medium'>
                      {bodyParts.indexOf(part) + 1}. {partLabel(part.id)}
                    </p>
                    <p className='text-muted-foreground text-xs'>
                      {paintModeLabel(selection.mode)}
                    </p>
                  </div>
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    aria-label={`Прибрати позначку: ${part.label}`}
                    onClick={() => {
                      onChange(value.filter((entry) => entry.partId !== part.id));
                      onBlur();
                    }}
                  >
                    Прибрати
                  </Button>
                </li>
              );
            })}
        </ul>
      ) : (
        <p className='text-muted-foreground text-sm'>
          Деталі ще не позначені. Схему можна залишити порожньою для інших робіт.
        </p>
      )}
    </FieldSet>
  );
}
