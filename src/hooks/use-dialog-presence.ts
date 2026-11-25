'use client';

import { useCallback, useState } from 'react';

interface DialogPresence {
  open: boolean;
  close: () => void;
  onOpenChangeComplete: (open: boolean) => void;
}

/** Keep the owner mounted until Base UI finishes its exit transition. */
export function useDialogPresence(onClosed: () => void): DialogPresence {
  const [open, setOpen] = useState(true);
  const close = useCallback(() => setOpen(false), []);
  const onOpenChangeComplete = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) onClosed();
    },
    [onClosed]
  );
  return { open, close, onOpenChangeComplete };
}
