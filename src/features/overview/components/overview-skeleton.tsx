import { Skeleton } from '@/components/ui/skeleton';
import type { ReactElement } from 'react';

export function OverviewSkeleton(): ReactElement {
  return (
    <div role='status' aria-label='Завантаження огляду CRM' className='flex flex-col gap-4'>
      <Skeleton className='h-10 w-full max-w-lg' />
      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className='h-36 w-full' />
        ))}
      </div>
      <div className='grid gap-4 lg:grid-cols-2'>
        {[0, 1].map((key) => (
          <Skeleton key={key} className='h-80 w-full' />
        ))}
      </div>
    </div>
  );
}
