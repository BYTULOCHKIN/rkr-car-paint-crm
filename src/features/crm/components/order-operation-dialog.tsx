'use client';

import { useId, useMemo, useState, type ReactNode, type ReactElement } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/animated-dialog';
import { DialogFormContext } from './dialog-form';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';

/** Own form scope: operation controls never submit or close the enclosing order. */
export function OrderOperationDialog({
  title,
  description,
  pending,
  onClose,
  children,
  formId: suppliedFormId,
  open,
  onOpenChangeComplete
}: {
  open: boolean;
  onOpenChangeComplete: (open: boolean) => void;
  formId?: string;
  title: string;
  description: string;
  pending: boolean;
  onClose: () => void;
  children: ReactNode;
}): ReactElement {
  const generatedFormId = useId();
  const formId = suppliedFormId ?? generatedFormId;
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);
  const layout = useMemo(() => ({ formId, footer }), [formId, footer]);
  return (
    <Dialog
      open={open}
      onOpenChangeComplete={onOpenChangeComplete}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        mobileSheet
        className='flex max-h-[90dvh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg'
      >
        <DialogHeader className='shrink-0 border-b p-5 pr-12'>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Button
          type='button'
          size='icon-sm'
          variant='ghost'
          className='absolute top-3 right-3'
          aria-label='Закрити діалог'
          disabled={pending}
          onClick={onClose}
        >
          <Icons.close />
        </Button>
        <DialogFormContext value={layout}>
          <div className='relative min-h-0 overflow-y-auto overscroll-contain p-5'>{children}</div>
          <div
            ref={setFooter}
            className='shrink-0 border-t bg-muted/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]'
          />
        </DialogFormContext>
      </DialogContent>
    </Dialog>
  );
}
