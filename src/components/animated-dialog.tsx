'use client';

import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import type { ReactElement } from 'react';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { DialogPortal } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';

interface AnimatedDialogContentProps extends DialogPrimitive.Popup.Props {
  showCloseButton?: boolean;
  mobileSheet?: boolean;
}

/** Base UI owns nested layers, focus and the end of the closing transition. */
export function DialogContent({
  children,
  className,
  showCloseButton = true,
  mobileSheet = false,
  ...props
}: AnimatedDialogContentProps): ReactElement {
  return (
    <DialogPortal>
      <DialogPrimitive.Backdrop
        data-crm-dialog-backdrop
        className='fixed inset-0 isolate z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs'
      />
      <DialogPrimitive.Popup
        data-slot='dialog-content'
        data-crm-dialog
        data-mobile-sheet={mobileSheet || undefined}
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 outline-none sm:max-w-sm',
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            render={
              <Button
                type='button'
                variant='ghost'
                size='icon-sm'
                className='absolute top-2 right-2'
              />
            }
          >
            <Icons.close />
            <span className='sr-only'>Закрити діалог</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}
