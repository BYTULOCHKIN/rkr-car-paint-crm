'use client';

import { Suspense, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { SHOW_LEGACY_REQUEST_FLOW } from '@/config/product';
import { SummaryCardLink } from '@/components/summary-card-link';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Icons } from '@/components/icons';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/features/crm/components/action-button';
import { CrmEditorDialog, type Editor } from '@/features/crm/components/editor-dialog';
import { money } from '@/features/crm/components/format';
import { overviewQueries } from '../api/queries';
import { displayDate } from '@/features/crm/lib/workflow';
import { useBusinessToday } from '../hooks/use-business-today';
import type { PeriodTrendKey as TrendKey } from '../lib/period-metrics';
import { parseAsString, useQueryStates } from 'nuqs';
import { currentOverviewMonth } from '../lib/period';
import { overviewPeriodSchema, type OverviewPeriod } from '../schemas/period';
import { overviewOrdersLink } from '../lib/order-links';
import { OverviewPeriodFilter } from './period-filter';
import { OverviewSkeleton } from './overview-skeleton';
import { MetricTrend, trendLabel } from './metric-trend';
import { compactMoney, compactNumber } from '../lib/format';
import { ActivityChart } from './activity-chart';
import { WorkQueue } from './work-queue';
import { StatusSummary } from './status-summary';
import { RecentOrders } from './recent-orders';

interface OverviewProps {
  userId: string;
  orgId?: string | null;
  initialToday: string;
}

export default function Overview({ userId, initialToday, orgId }: OverviewProps): ReactElement {
  const today = useBusinessToday(initialToday);
  const defaults = currentOverviewMonth(today);
  const [params, setParams] = useQueryStates(
    { overviewFrom: parseAsString, overviewTo: parseAsString },
    { shallow: true }
  );
  const period = {
    from: params.overviewFrom ?? defaults.from,
    to: params.overviewTo ?? defaults.to
  };
  const parsed = overviewPeriodSchema.safeParse(period);
  return (
    <div className='flex min-w-0 flex-col gap-5'>
      <OverviewPeriodFilter
        key={JSON.stringify(period)}
        period={period}
        today={today}
        onApply={(value) => void setParams({ overviewFrom: value.from, overviewTo: value.to })}
      />
      {parsed.success ? (
        <Suspense fallback={<OverviewSkeleton />}>
          <OverviewContent userId={userId} orgId={orgId} today={today} period={parsed.data} />
        </Suspense>
      ) : (
        <Alert variant='destructive'>
          <AlertDescription>
            Перевірте період огляду: {parsed.error.issues[0]?.message}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function OverviewContent({
  userId,
  orgId,
  today,
  period
}: {
  userId: string;
  orgId?: string | null;
  today: string;
  period: OverviewPeriod;
}): ReactElement {
  const { data: report, isRefetchError } = useSuspenseQuery(
    overviewQueries.report(userId, orgId!, today, period)
  );
  const { data, metrics, trends, empty } = report;
  const [editor, setEditor] = useState<Editor | null>(null);
  const currentMonth = currentOverviewMonth(today);
  const isCurrentMonth = period.from === currentMonth.from && period.to === currentMonth.to;
  const cards = [
    {
      title: 'Створені замовлення',
      trendKey: 'createdOrders' as TrendKey,
      value: String(metrics.createdOrders),
      description: 'Очікують початку робіт',
      href: '/dashboard/orders?orderStatus=created',
      icon: Icons.orders
    },
    {
      title: 'Замовлення в роботі',
      trendKey: 'inProgress' as TrendKey,
      value: String(metrics.inProgress),
      description:
        'Створено: ' +
        compactNumber(metrics.createdOrders) +
        ' · Вартість відкритих: ' +
        compactMoney(metrics.activeValueCents),
      href: '/dashboard/orders?orderStatus=in_progress',
      icon: Icons.orders
    },
    {
      title: 'Готові замовлення',
      trendKey: 'ready' as TrendKey,
      value: String(metrics.ready),
      description: 'Прострочених прийомів і видач: ' + compactNumber(metrics.overdue),
      href: '/dashboard/orders?orderStatus=ready',
      icon: Icons.check
    },
    {
      title: isCurrentMonth ? 'Завершено цього місяця' : 'Завершено за період',
      trendKey: 'deliveredThisMonth' as TrendKey,
      value: String(metrics.deliveredThisMonth),
      description: 'Вартість замовлень: ' + compactMoney(metrics.deliveredValueCents),
      href: overviewOrdersLink('completed', period),
      icon: Icons.billing
    }
  ];
  const financialCards = [
    {
      title: 'Прибуток фірми',
      trendKey: 'profitCents' as TrendKey,
      value: metrics.profitCents,
      description:
        'Після матеріалів, субпідряду й нарахованих зарплат. За останнім збереженим розрахунком.',
      href: overviewOrdersLink('profit', period),
      icon: Icons.billing
    },
    {
      title: 'Надходження за період',
      trendKey: 'monthlyReceiptsCents' as TrendKey,
      value: metrics.monthlyReceiptsCents,
      description: 'За датами платежів і повернень; скасовані не враховано.',
      href: overviewOrdersLink('receipts', period),
      icon: Icons.billing
    },
    {
      title: 'Заборгованість за готовими авто',
      trendKey: 'debtCents' as TrendKey,
      value: metrics.debtCents,
      description:
        'Поточний борг за готовими у вибраному періоді авто: ' +
        compactNumber(metrics.debtOrderCount),
      href: overviewOrdersLink('ready_debt', period),
      icon: Icons.warning
    },
    {
      title: 'До сплати за відкритими авто',
      trendKey: 'pendingPaymentCents' as TrendKey,
      value: metrics.pendingPaymentCents,
      description: 'Поточний залишок за відкритими авто, створеними у вибраному періоді.',
      href: overviewOrdersLink('open_debt', period),
      icon: Icons.orders
    }
  ];

  return (
    <div className='flex min-w-0 flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-end gap-3'>
        <div className='flex flex-wrap gap-2'>
          {SHOW_LEGACY_REQUEST_FLOW && (
            <Button size='sm' onClick={() => setEditor({ type: 'request' })}>
              <span className='inline-flex items-center gap-1.5 whitespace-nowrap'>
                <Icons.add aria-hidden data-icon='inline-start' />
                <span>Нова заявка</span>
              </span>
            </Button>
          )}
          <Button size='sm' variant='outline' onClick={() => setEditor({ type: 'order' })}>
            <span className='inline-flex items-center gap-1.5 whitespace-nowrap'>
              <Icons.orders aria-hidden data-icon='inline-start' />
              <span>Нове замовлення</span>
            </span>
          </Button>
          <ButtonGroup aria-label='Додавання клієнта й авто' className='shrink-0'>
            <Button size='sm' variant='outline' onClick={() => setEditor({ type: 'customer' })}>
              <span className='inline-flex items-center gap-1.5 whitespace-nowrap'>
                <Icons.user aria-hidden data-icon='inline-start' />
                <span>Додати клієнта</span>
              </span>
            </Button>
            <Button size='sm' variant='outline' onClick={() => setEditor({ type: 'vehicle' })}>
              <span className='inline-flex items-center gap-1.5 whitespace-nowrap'>
                <Icons.car aria-hidden data-icon='inline-start' />
                <span>Додати авто</span>
              </span>
            </Button>
          </ButtonGroup>
        </div>
      </div>
      {isRefetchError && (
        <Alert>
          <AlertDescription>
            Не вдалося оновити огляд. Показано останні завантажені дані; повторна спроба відбудеться
            автоматично.
          </AlertDescription>
        </Alert>
      )}
      <p className='text-xs text-muted-foreground'>
        Поточні статуси — на сьогодні. Завершені замовлення — за {displayDate(period.from)} —{' '}
        {displayDate(period.to)}.
      </p>
      <div className='grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        {cards.map(({ title, trendKey, value, description, href, icon: Icon }) => (
          <SummaryCardLink
            key={title}
            href={href}
            label={`${title}: ${value}. ${trendLabel(trends.metrics[trendKey])}`}
          >
            <CardHeader className='relative'>
              <CardDescription>{title}</CardDescription>
              <CardTitle className='text-3xl font-semibold tabular-nums'>
                {compactNumber(Number(value))}
              </CardTitle>
              <MetricTrend trend={trends.metrics[trendKey]} title={title} direction='up' />
              <CardAction>
                <Icon aria-hidden className='size-4 text-muted-foreground' />
              </CardAction>
            </CardHeader>
            <CardFooter className='min-h-14 items-start text-xs text-muted-foreground'>
              {description}
            </CardFooter>
          </SummaryCardLink>
        ))}
      </div>
      <div className='flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground'>
        <Link href='/dashboard/clients' className='underline underline-offset-4'>
          Клієнтів у базі: {data.customers.length}
        </Link>
        <Link href='/dashboard/vehicles' className='underline underline-offset-4'>
          Автомобілів: {data.vehicles.length}
        </Link>
        <span>Суми — вартість робіт за позиціями.</span>
        {metrics.undatedDelivered > 0 && (
          <span>
            Без дати готовності: {metrics.undatedDelivered}; у підсумок періоду не включені.
          </span>
        )}
      </div>
      <section
        aria-label='Фінанси автомалярки'
        className='grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4'
      >
        {financialCards.map(({ title, trendKey, value, description, href, icon: Icon }) => (
          <SummaryCardLink
            key={title}
            href={href}
            label={`${title}: ${trendKey === 'profitCents' && metrics.unpostedProfitCount > 0 && metrics.unpostedProfitCount === metrics.deliveredThisMonth ? 'немає розрахунку' : money(value)}. ${trendLabel(trends.metrics[trendKey])}`}
          >
            <CardHeader className='relative'>
              <CardDescription>{title}</CardDescription>
              <CardTitle className='break-words text-2xl font-semibold tabular-nums'>
                {trendKey === 'profitCents' &&
                metrics.unpostedProfitCount > 0 &&
                metrics.unpostedProfitCount === metrics.deliveredThisMonth
                  ? '—'
                  : compactMoney(value)}
              </CardTitle>
              <MetricTrend
                trend={trends.metrics[trendKey]}
                title={title}
                currency
                direction={
                  trendKey === 'debtCents' || trendKey === 'pendingPaymentCents' ? 'down' : 'up'
                }
              />
              <CardAction>
                <Icon aria-hidden className='size-4 text-muted-foreground' />
              </CardAction>
            </CardHeader>
            <CardFooter className='text-xs text-muted-foreground'>{description}</CardFooter>
          </SummaryCardLink>
        ))}
      </section>
      <p className='text-xs text-muted-foreground'>
        Фінансові показники порівнюються з {displayDate(trends.previousStart)} —{' '}
        {displayDate(trends.previousEnd)}. Зміни вартості й витрат оновлюють прибуток за період
        готовності авто.
      </p>
      {metrics.unpostedProfitCount > 0 && (
        <Alert>
          <AlertDescription>
            Прибуток розраховано для {metrics.deliveredThisMonth - metrics.unpostedProfitCount} із{' '}
            {metrics.deliveredThisMonth} завершених замовлень.{' '}
            <Link href={overviewOrdersLink('unposted', period)} className='underline'>
              Без розрахунку: {metrics.unpostedProfitCount}
            </Link>
          </AlertDescription>
        </Alert>
      )}
      {empty && (
        <Empty className='rounded-xl border bg-card'>
          <EmptyHeader>
            <EmptyTitle>Почнімо роботу з CRM</EmptyTitle>
            <EmptyDescription>
              Додайте клієнта, закріпіть його автомобіль і створіть перше замовлення. Дані
              автоматично з’являться в огляді.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => setEditor({ type: 'customer' })}>Створити першого клієнта</Button>
        </Empty>
      )}
      <div className='grid min-w-0 gap-4 lg:grid-cols-2'>
        <WorkQueue
          title='Потребують уваги'
          total={report.queueCounts?.attention ?? metrics.attention.length}
          description='Прострочені прийоми й завершення робіт'
          entries={metrics.attention.map((target) => ({
            target,
            date:
              target.kind === 'request'
                ? target.record.plannedIntakeDate
                : target.record.plannedDeliveryDate,
            label: target.kind === 'request' ? 'Прийом · план' : 'Видача · план'
          }))}
          data={data}
          today={today}
          onOpen={(target) => setEditor({ type: 'workflow', target })}
          emptyTitle='Усе під контролем'
          emptyDescription='Прострочених робіт немає.'
        />
        <WorkQueue
          title='Найближчі 7 днів'
          total={report.queueCounts?.schedule ?? metrics.schedule.length}
          description='Планові прийоми й видачі, починаючи із сьогодні'
          entries={metrics.schedule.map((entry) => ({
            ...entry,
            label: entry.kind === 'intake' ? 'Прийом · план' : 'Видача · план'
          }))}
          data={data}
          today={today}
          onOpen={(target) => setEditor({ type: 'workflow', target })}
          emptyTitle='Запланованих подій немає'
          emptyDescription='Укажіть планову дату прийому або видачі в заявці чи замовленні.'
        />
      </div>
      <div className='grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
        <ActivityChart data={metrics.activity} />
        <StatusSummary statuses={metrics.statuses} />
      </div>
      <RecentOrders
        href={overviewOrdersLink('created_period', period)}
        orders={metrics.recentOrders}
        data={data}
        onOpen={(order) => setEditor({ type: 'order', order })}
      />
      {editor && (
        <CrmEditorDialog
          key={
            editor.type === 'order'
              ? (editor.order?.id ?? 'new-order')
              : editor.type === 'workflow'
                ? editor.target.kind + '-' + editor.target.record.id
                : editor.type
          }
          editor={editor}
          data={data}
          onClose={() => setEditor(null)}
          onSelectOrder={(order) => setEditor({ type: 'order', order })}
        />
      )}
    </div>
  );
}
