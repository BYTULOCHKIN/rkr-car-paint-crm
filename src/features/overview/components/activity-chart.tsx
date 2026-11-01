'use client';

import type { ReactElement } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import type { ActivityMonth } from '../lib/metrics';

const config = {
  requests: { label: 'Заявки', color: 'var(--chart-1)' },
  orders: { label: 'Замовлення', color: 'var(--chart-2)' }
} satisfies ChartConfig;

interface ActivityChartProps {
  data: ActivityMonth[];
}

export function ActivityChart({ data }: ActivityChartProps): ReactElement {
  const hasData = data.some((month) => month.requests || month.orders);
  return (
    <Card className='min-w-0'>
      <CardHeader>
        <CardTitle>Динаміка звернень</CardTitle>
        <CardDescription>Створені заявки та замовлення за останні 6 місяців</CardDescription>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <>
            <ChartContainer
              config={config}
              className='h-64 w-full'
              aria-label='Кількість створених заявок і замовлень за місяцями'
            >
              <BarChart accessibilityLayer data={data} margin={{ left: -24, right: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey='label'
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  minTickGap={12}
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar
                  dataKey='requests'
                  fill='var(--color-requests)'
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey='orders'
                  fill='var(--color-orders)'
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ChartContainer>
            <details className='mt-4 text-xs text-muted-foreground'>
              <summary className='cursor-pointer'>Дані графіка</summary>
              <ul className='mt-2 flex flex-col gap-1'>
                {data.map((month) => (
                  <li key={month.month}>
                    {month.label}: заявки — {month.requests}, замовлення — {month.orders}
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : (
          <Empty className='min-h-64'>
            <EmptyHeader>
              <EmptyTitle>Звернень ще немає</EmptyTitle>
              <EmptyDescription>
                Графік з’явиться після створення заявок або замовлень.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}
