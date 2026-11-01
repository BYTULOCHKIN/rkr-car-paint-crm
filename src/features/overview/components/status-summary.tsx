import Link from 'next/link';
import type { ReactElement } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { OverviewMetrics } from '../lib/metrics';

interface StatusSummaryProps {
  statuses: OverviewMetrics['statuses'];
}

export function StatusSummary({ statuses }: StatusSummaryProps): ReactElement {
  const total = statuses.reduce((sum, status) => sum + status.count, 0);
  return (
    <Card className='min-w-0'>
      <CardHeader>
        <CardTitle>Поточне завантаження</CardTitle>
        <CardDescription>Активні заявки й замовлення за статусами</CardDescription>
      </CardHeader>
      <CardContent className='flex flex-1 flex-col gap-5'>
        {statuses.map((status) => (
          <div key={status.value} className='flex flex-col gap-2'>
            <div className='flex justify-between gap-2 text-sm'>
              <span>{status.label}</span>
              <span className='font-medium tabular-nums'>{status.count}</span>
            </div>
            <Progress
              value={total ? (status.count / total) * 100 : 0}
              aria-label={`${status.label}: ${status.count} із ${total}`}
            />
          </div>
        ))}
      </CardContent>
      <CardFooter className='text-xs text-muted-foreground'>
        <Link href='/dashboard/kanban' className='underline underline-offset-4'>
          Керувати на дошці робіт
        </Link>
      </CardFooter>
    </Card>
  );
}
