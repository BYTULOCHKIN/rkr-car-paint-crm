'use client';

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import Link from 'next/link';
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
import { crmQueries } from '@/features/crm/api/queries';
import { businessToday, displayDate } from '@/features/crm/lib/workflow';
import { overviewTrends, type TrendKey } from '../lib/trends';
import { MetricTrend, trendLabel } from './metric-trend';
import { overviewMetrics } from '../lib/metrics';
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
  const { data, isRefetchError } = useSuspenseQuery({
    ...crmQueries.workspace(userId, orgId),
    refetchInterval: 60_000
  });
  const [today, setToday] = useState(initialToday);
  const [editor, setEditor] = useState<Editor | null>(null);
  useEffect(() => {
    const refreshDate = () => setToday(businessToday());
    refreshDate();
    const timer = window.setInterval(refreshDate, 60_000);
    window.addEventListener('focus', refreshDate);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshDate);
    };
  }, []);
  const metrics = useMemo(() => overviewMetrics(data, today), [data, today]);
  const trends = useMemo(() => overviewTrends(data, today, metrics), [data, today, metrics]);
  const cards = [
    {
      title: 'Активні заявки',
      trendKey: 'activeRequests' as TrendKey,
      value: String(metrics.activeRequests),
      description:
        'Backlog: ' +
        compactNumber(metrics.backlog) +
        ' · Заплановано: ' +
        compactNumber(metrics.scheduled),
      href: '/dashboard/requests',
      icon: Icons.requests
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
      href: '/dashboard/orders',
      icon: Icons.orders
    },
    {
      title: 'Готові до видачі',
      trendKey: 'ready' as TrendKey,
      value: String(metrics.ready),
      description: 'Прострочених прийомів і видач: ' + compactNumber(metrics.overdue),
      href: '/dashboard/kanban',
      icon: Icons.check
    },
    {
      title: 'Видано цього місяця',
      trendKey: 'deliveredThisMonth' as TrendKey,
      value: String(metrics.deliveredThisMonth),
      description: 'Вартість замовлень: ' + compactMoney(metrics.deliveredValueCents),
      href: '/dashboard/orders',
      icon: Icons.billing
    }
  ];
  const financialCards = [
    {
      title: 'Надходження за місяць',
      trendKey: 'monthlyReceiptsCents' as TrendKey,
      value: metrics.monthlyReceiptsCents,
      description: 'Фактично отримані платежі; скасовані не враховано.',
      icon: Icons.billing
    },
    {
      title: 'Заборгованість за виданими авто',
      trendKey: 'debtCents' as TrendKey,
      value: metrics.debtCents,
      description: 'Неоплачених виданих замовлень: ' + compactNumber(metrics.debtOrderCount),
      icon: Icons.warning
    },
    {
      title: 'До сплати за невиданими авто',
      trendKey: 'pendingPaymentCents' as TrendKey,
      value: metrics.pendingPaymentCents,
      description: 'Залишок за створеними замовленнями, авто в роботі та готовими.',
      icon: Icons.orders
    }
  ];
  const empty =
    !data.customers.length && !data.vehicles.length && !data.requests.length && !data.orders.length;
  return (
    <div className='flex min-w-0 flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='text-sm text-muted-foreground'>Стан на {displayDate(today)} · Київ</p>
        <div className='flex flex-wrap gap-2'>
          <Button size='sm' onClick={() => setEditor({ type: 'request' })}>
            <span className='inline-flex items-center gap-1.5 whitespace-nowrap'>
              <Icons.add aria-hidden data-icon='inline-start' />
              <span>Нова заявка</span>
            </span>
          </Button>
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
          <span>Без дати видачі: {metrics.undatedDelivered}; у підсумок місяця не включені.</span>
        )}
      </div>
      <section aria-label='Фінанси автомалярки' className='grid min-w-0 gap-4 md:grid-cols-3'>
        {financialCards.map(({ title, trendKey, value, description, icon: Icon }) => (
          <SummaryCardLink
            key={title}
            href='/dashboard/orders'
            label={`${title}: ${money(value)}. ${trendLabel(trends.metrics[trendKey])}`}
          >
            <CardHeader className='relative'>
              <CardDescription>{title}</CardDescription>
              <CardTitle className='break-words text-2xl font-semibold tabular-nums'>
                {compactMoney(value)}
              </CardTitle>
              <MetricTrend
                trend={trends.metrics[trendKey]}
                title={title}
                currency
                direction={trendKey === 'debtCents' ? 'down' : 'up'}
              />
              <CardAction>
                <Icon aria-hidden className='size-4 text-muted-foreground' />
              </CardAction>
            </CardHeader>
            <CardFooter className='text-xs text-muted-foreground'>{description}</CardFooter>
          </SummaryCardLink>
        ))}
      </section>
      {empty && (
        <Empty className='rounded-xl border bg-card'>
          <EmptyHeader>
            <EmptyTitle>Почнімо роботу з CRM</EmptyTitle>
            <EmptyDescription>
              Додайте клієнта, закріпіть його автомобіль і створіть першу заявку. Дані автоматично
              з’являться в огляді.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => setEditor({ type: 'customer' })}>Створити першого клієнта</Button>
        </Empty>
      )}
      <div className='grid min-w-0 gap-4 lg:grid-cols-2'>
        <WorkQueue
          title='Потребують уваги'
          description='Прострочені прийоми й видачі та готові автомобілі'
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
          emptyDescription='Прострочень і автомобілів, що очікують видачі, немає.'
        />
        <WorkQueue
          title='Найближчі 7 днів'
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
