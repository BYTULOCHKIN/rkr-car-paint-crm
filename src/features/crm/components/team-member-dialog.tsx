'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { useStore } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAppForm } from '@/lib/form';
import { PersonAvatar } from '@/components/person-avatar';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FieldGroup } from '@/components/ui/field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import type { TeamMember } from '../api/types';
import { crmMutations, crmQueries } from '../api/queries';
import { workerSpecialtyOptions } from '../lib/team-specialties';
import { teamMemberSettingsSchema } from '../schemas/team-member';
import { Button } from './action-button';

interface TeamMemberDialogProps {
  member: TeamMember;
  orgId: string;
  editable: boolean;
  onClose: () => void;
}

export function TeamMemberDialog({ member, orgId, editable, onClose }: TeamMemberDialogProps) {
  const [defaults] = useState(() => ({ specialties: [...(member.specialties ?? [])] }));
  const [discard, setDiscard] = useState(false);
  const formId = useId();
  const client = useQueryClient();
  const mutation = useMutation({
    ...crmMutations.updateTeamMember(),
    onSuccess: () => toast.success('Налаштування учасника збережено'),
    onSettled: () => client.invalidateQueries({ queryKey: crmQueries.all() })
  });
  const form = useAppForm({
    defaultValues: defaults,
    validators: { onSubmit: teamMemberSettingsSchema },
    onSubmit: async ({ value }) => {
      if (!editable) return;
      try {
        await mutation.mutateAsync({ orgId, userId: member.id, ...value });
        onClose();
      } catch {
        // Keep the user's selection so a failed Clerk request can be retried.
      }
    }
  });
  const dirty = useStore(form.store, (state) => !state.isDefaultValue);
  const submitting = useStore(form.store, (state) => state.isSubmitting);
  const busy = submitting || mutation.isPending;
  const requestClose = useCallback(() => {
    if (form.state.isSubmitting || mutation.isPending) return;
    if (!form.state.isDefaultValue && editable) setDiscard(true);
    else onClose();
  }, [form, mutation.isPending, editable, onClose]);

  useEffect(() => {
    if (!dirty || !editable) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, editable]);

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestClose()}>
        <DialogContent
          className='max-h-[90dvh] overflow-y-auto sm:max-w-lg'
          showCloseButton={!busy}
        >
          <DialogHeader>
            <DialogTitle>Учасник команди — {member.name}</DialogTitle>
            <DialogDescription>
              Спеціалізації визначають, які роботи можна доручити учаснику в цій автомалярці.
            </DialogDescription>
          </DialogHeader>
          <div className='flex min-w-0 items-center gap-3'>
            <PersonAvatar
              identity={`user:${member.id}`}
              name={member.name}
              imageUrl={member.imageUrl}
            />
            <div className='min-w-0'>
              <p className='break-words font-medium'>{member.name}</p>
              <p className='break-all text-sm text-muted-foreground'>{member.identifier}</p>
            </div>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-sm text-muted-foreground'>Доступ до CRM</span>
            <Badge variant={member.role === 'admin' ? 'default' : 'secondary'}>
              {member.role === 'admin' ? 'Адміністратор' : 'Виконавець'}
            </Badge>
          </div>
          <form
            id={formId}
            aria-label='Налаштування учасника команди'
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <fieldset disabled={!editable || busy} className='min-w-0'>
              <FieldGroup>
                <form.AppField name='specialties' mode='array'>
                  {(field) => (
                    <field.CheckboxGroupField
                      label='Спеціалізації'
                      description='Можна вибрати кілька або залишити без спеціалізації.'
                      options={workerSpecialtyOptions.map((option) => ({
                        ...option,
                        disabled: !editable || busy
                      }))}
                    />
                  )}
                </form.AppField>
                <p className='text-sm text-muted-foreground'>
                  Нарахування залежать від призначення в замовленні. Зміна спеціалізацій не змінює
                  попередні роботи та виплати.
                </p>
                {!editable && (
                  <p className='text-sm text-muted-foreground'>
                    Редагувати спеціалізації може лише адміністратор.
                  </p>
                )}
                {mutation.error && (
                  <Alert variant='destructive' role='alert'>
                    <AlertDescription>{mutation.error.message}</AlertDescription>
                  </Alert>
                )}
              </FieldGroup>
            </fieldset>
          </form>
          <DialogFooter>
            <Button type='button' variant='outline' disabled={busy} onClick={requestClose}>
              {editable ? 'Скасувати' : 'Закрити'}
            </Button>
            {editable && (
              <Button type='submit' form={formId} isLoading={busy} disabled={!dirty}>
                Зберегти налаштування
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={discard} onOpenChange={setDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Відкинути зміни?</AlertDialogTitle>
            <AlertDialogDescription>Вибрані спеціалізації ще не збережено.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant='outline' onClick={() => setDiscard(false)}>
              Продовжити редагування
            </Button>
            <Button variant='destructive' onClick={onClose}>
              Відкинути зміни
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
