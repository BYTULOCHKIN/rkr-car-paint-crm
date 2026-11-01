'use client';

import type { ComponentProps } from 'react';
import { Button as BaseButton } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

interface ButtonProps extends ComponentProps<typeof BaseButton> {
  isLoading?: boolean;
}

// The installed template has no isLoading prop on its primitive Button.
// Extend it here so CRM follows the loading contract without modifying ui/.
export function Button({ isLoading, children, disabled, ...props }: ButtonProps) {
  return (
    <BaseButton {...props} disabled={disabled || isLoading} aria-busy={isLoading || undefined}>
      <span className='grid place-items-center'>
        <span
          className='col-start-1 row-start-1'
          style={{ visibility: isLoading ? 'hidden' : undefined }}
        >
          {children}
        </span>
        {isLoading && <Spinner className='col-start-1 row-start-1' aria-label='Збереження' />}
      </span>
    </BaseButton>
  );
}
