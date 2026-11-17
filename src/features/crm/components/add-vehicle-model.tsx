'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAppForm } from '@/lib/form';
import { Icons } from '@/components/icons';
import { FieldGroup } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { crmMutations, crmQueries } from '../api/queries';
import { vehicleModelSchema } from '../schemas/vehicle-model';
import { Button } from './action-button';
import type { FormState } from './form-status';

interface AddVehicleModelProps {
  make: string;
  orgId?: string;
  choices: { value: string; label: string }[];
  onSelect: (model: string) => void;
  onStateChange: (state: FormState) => void;
}

export function AddVehicleModel({
  make,
  orgId,
  choices,
  onSelect,
  onStateChange
}: AddVehicleModelProps) {
  const [open, setOpen] = useState(false);
  const client = useQueryClient();
  const mutation = useMutation({
    ...crmMutations.vehicleModel(),
    onSuccess: (model) => {
      // Seed the active selector before refetching, including during a catalog outage.
      client.setQueryData(crmQueries.catalog(make, orgId).queryKey, (previous) => ({
        makes: previous?.makes ?? [make],
        models: [...new Set([...(previous?.models ?? []), model])].toSorted(),
        warning: previous?.warning ?? null
      }));
      onSelect(model);
      toast.success('Модель додано до довідника');
      setOpen(false);
      form.reset();
    },
    onSettled: () =>
      client.invalidateQueries({
        queryKey: ['vehicle-catalog', orgId ?? 'legacy']
      })
  });
  const form = useAppForm({
    defaultValues: { newModel: '' },
    validators: {
      onSubmit: z.object({ newModel: vehicleModelSchema.shape.model })
    },
    onSubmit: async ({ value }) => {
      const model = vehicleModelSchema.shape.model.parse(value.newModel);
      const existing = choices.find((choice) => choice.value.toUpperCase() === model.toUpperCase());
      if (existing) {
        onSelect(existing.value);
        setOpen(false);
        form.reset();
        return;
      }
      await mutation.mutateAsync({ make, model, orgId }).catch(() => undefined);
    }
  });

  useEffect(() => {
    onStateChange({ dirty: open, pending: mutation.isPending });
  }, [open, mutation.isPending, onStateChange]);
  useEffect(() => () => onStateChange({ dirty: false, pending: false }), [onStateChange]);

  if (!open)
    return (
      <Button
        type='button'
        variant='ghost'
        size='sm'
        disabled={!make}
        onClick={() => setOpen(true)}
      >
        <span className='flex items-center gap-2'>
          <Icons.add aria-hidden />
          Додати модель
        </span>
      </Button>
    );

  return (
    <FieldGroup className='bg-muted/40 gap-3 rounded-lg border p-3'>
      <p className='text-sm font-medium'>Нова модель {make}</p>
      <form.AppField name='newModel'>
        {(field) => (
          <field.TextField
            label='Назва моделі'
            required
            autoFocus
            maxLength={80}
            disabled={mutation.isPending}
            placeholder='Наприклад, 001'
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                if (!mutation.isPending) void form.handleSubmit();
              }
            }}
          />
        )}
      </form.AppField>
      {mutation.error && (
        <Alert variant='destructive'>
          <AlertDescription>{mutation.error.message}</AlertDescription>
        </Alert>
      )}
      <div className='flex flex-wrap gap-2'>
        <Button
          type='button'
          size='sm'
          isLoading={mutation.isPending}
          onClick={() => void form.handleSubmit()}
        >
          Додати й вибрати
        </Button>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={mutation.isPending}
          onClick={() => {
            setOpen(false);
            form.reset();
            mutation.reset();
          }}
        >
          Скасувати додавання
        </Button>
      </div>
    </FieldGroup>
  );
}
