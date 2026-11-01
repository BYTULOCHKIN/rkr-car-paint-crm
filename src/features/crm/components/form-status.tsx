'use client';

import { useEffect } from 'react';
import { DialogActions, useDialogFormId } from './dialog-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from './action-button';

export interface FormState {
  dirty: boolean;
  pending: boolean;
}
export interface SaveProps {
  onSaved: () => void;
  onCancel?: () => void;
  onStateChange?: (state: FormState) => void;
}

interface FormStatusProps extends FormState {
  onChange?: SaveProps['onStateChange'];
}

// This effect synchronizes the form library's state with the enclosing dialog.
export function FormStatus({ dirty, pending, onChange }: FormStatusProps) {
  useEffect(() => {
    onChange?.({ dirty, pending });
  }, [dirty, pending, onChange]);
  return null;
}

interface FormActionsProps {
  pending: boolean;
  error: Error | null;
  disabled?: boolean;
  onCancel?: () => void;
  label: string;
}

export function FormActions({ pending, error, disabled, onCancel, label }: FormActionsProps) {
  const formId = useDialogFormId();
  return (
    <>
      {error && (
        <Alert variant='destructive'>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <DialogActions>
        {onCancel && (
          <Button type='button' variant='outline' disabled={pending} onClick={onCancel}>
            Скасувати
          </Button>
        )}
        <Button type='submit' form={formId} isLoading={pending} disabled={disabled}>
          {label}
        </Button>
      </DialogActions>
    </>
  );
}
