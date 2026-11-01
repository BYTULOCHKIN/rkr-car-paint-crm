'use client';

import {
  createContext,
  useContext,
  useId,
  type ComponentProps,
  type ReactNode,
  type ReactElement
} from 'react';
import { createPortal } from 'react-dom';
import { DialogFooter } from '@/components/ui/dialog';

interface DialogFormLayout {
  formId: string;
  footer: HTMLElement | null;
}
export const DialogFormContext = createContext<DialogFormLayout | null>(null);

export function CrmForm(props: ComponentProps<'form'>): ReactElement {
  const layout = useContext(DialogFormContext);
  const id = useId();
  return <form {...props} id={layout?.formId ?? id} />;
}

// Keep controls subscribed to their form state while rendering in the stationary footer.
// Submit buttons target CrmForm by ID, preserving native submission and validation.
export function DialogActions({ children }: { children: ReactNode }): ReactElement | null {
  const layout = useContext(DialogFormContext);
  if (!layout) return <DialogFooter>{children}</DialogFooter>;
  return layout.footer
    ? createPortal(
        <div className='flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end'>
          {children}
        </div>,
        layout.footer
      )
    : null;
}

export function useDialogFormId(): string | undefined {
  return useContext(DialogFormContext)?.formId;
}
