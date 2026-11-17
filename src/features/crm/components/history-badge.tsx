import type { ComponentProps } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const tones = {
  neutral: 'border-border bg-muted text-foreground',
  info: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200',
  warning:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200',
  ready:
    'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200',
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
};

interface HistoryBadgeProps extends Omit<ComponentProps<typeof Badge>, 'variant'> {
  tone?: keyof typeof tones;
}

export function HistoryBadge({ tone = 'neutral', className, ...props }: HistoryBadgeProps) {
  return (
    <Badge
      {...props}
      variant='outline'
      className={cn('h-auto min-h-6 px-2 py-0.5 leading-4', tones[tone], className)}
    />
  );
}
