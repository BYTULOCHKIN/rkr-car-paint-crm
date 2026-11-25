'use client';

import Link from 'next/link';
import type { ReactElement } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { displayDate } from '@/features/crm/lib/workflow';
import { useBusinessToday } from '../hooks/use-business-today';

interface OverviewHeaderActionsProps {
  initialToday: string;
}

export function OverviewHeaderActions({ initialToday }: OverviewHeaderActionsProps): ReactElement {
  const today = useBusinessToday(initialToday);
  return (
    <div className='flex items-center gap-3'>
      <p className='text-sm whitespace-nowrap text-muted-foreground'>
        Стан на {displayDate(today)} · Київ
      </p>
      <Link href='/dashboard/kanban' className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        Дошка робіт
      </Link>
    </div>
  );
}
