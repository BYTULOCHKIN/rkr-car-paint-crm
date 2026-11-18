'use client';

import { Line, LineChart, YAxis } from 'recharts';
import { cn } from '@/lib/utils';
import { money } from '@/features/crm/components/format';
import type { MetricTrend as Trend } from '../lib/trends';
import { compactMoney, compactNumber, formatPercentage } from '../lib/format';

const count = new Intl.NumberFormat('uk-UA');
export function trendLabel(trend: Trend): string {
  if (trend.comparison === 'unknown') return 'Немає даних за минулий період';
  if (trend.comparison === 'new') return 'Новий показник';
  return formatPercentage(trend.percentage!);
}

export function MetricTrend({
  trend,
  title,
  currency = false,
  direction = 'up'
}: {
  trend: Trend;
  title: string;
  currency?: boolean;
  direction?: 'up' | 'down';
}) {
  const delta = trend.previous === null ? 0 : trend.current - trend.previous;
  const favorable = direction === 'up' ? delta > 0 : delta < 0;
  const unfavorable = direction === 'up' ? delta < 0 : delta > 0;
  const formatted = (value: number) => (currency ? money(value) : count.format(value));
  const change =
    trend.comparison === 'new'
      ? `+${currency ? compactMoney(delta) : compactNumber(delta)}`
      : trend.comparison === 'unknown'
        ? '—'
        : trendLabel(trend);
  return (
    <div className='absolute right-4 -bottom-3.5 flex items-end gap-2' data-slot='metric-trend'>
      <div className='h-4 w-20 text-primary/60'>
        <LineChart
          width={80}
          height={16}
          data={trend.points}
          margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
          accessibilityLayer={false}
          role='img'
          aria-label={`${title}: динаміка за поточний місяць`}
        >
          <title>
            {title}:{' '}
            {trend.points
              .map(
                (point) =>
                  `${point.date}: ${point.value === null ? 'немає історії' : formatted(point.value)}`
              )
              .join('; ')}
          </title>
          <YAxis hide domain={[0, (maximum: number) => Math.max(1, maximum)]} />
          <Line
            type='linear'
            dataKey='value'
            stroke='currentColor'
            strokeWidth={1.5}
            connectNulls={false}
            dot={trend.points.length === 1 ? { r: 2, fill: 'currentColor', strokeWidth: 0 } : false}
            activeDot={false}
            isAnimationActive='auto'
            animationDuration={900}
            animationEasing='ease-out'
          />
        </LineChart>
      </div>
      <span
        aria-label={`${trend.comparison === 'new' ? '+' + formatted(delta) : trendLabel(trend)} в порівнянні з попереднім періодом`}
        className={cn(
          'shrink-0 text-xs leading-4 font-medium tabular-nums',
          favorable
            ? 'text-emerald-700 dark:text-emerald-400'
            : unfavorable
              ? 'text-red-700 dark:text-red-400'
              : 'text-muted-foreground'
        )}
      >
        {change}
      </span>
    </div>
  );
}
