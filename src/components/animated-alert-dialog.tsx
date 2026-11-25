'use client';

import type { ComponentProps, ReactElement } from 'react';
import { AlertDialogContent as BaseAlertDialogContent } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

export {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';

export function AlertDialogContent({
  className,
  ...props
}: ComponentProps<typeof BaseAlertDialogContent>): ReactElement {
  return (
    <BaseAlertDialogContent
      data-crm-dialog
      className={cn('data-open:animate-none data-closed:animate-none', className)}
      {...props}
    />
  );
}
