'use client';

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Icons } from '@/components/icons';
import {
  Card,
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
import { overviewMetrics } from '../lib/metrics';
import { ActivityChart } from './activity-chart';
import { WorkQueue } from './work-queue';
import { StatusSummary } from './status-summary';
import { RecentOrders } from './recent-orders';

interface OverviewProps {
  userId: string;
  initialToday: string;
}

export default function Overview({ userId, initialToday }: OverviewProps): ReactElement {
  const { data, isRefetchError } = useSuspenseQuery({
    ...crmQueries.workspace(userId),
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
  const cards = [
    {
      title: 'Активні заявки',
      value: String(metrics.activeRequests),
      description: 'Backlog: ' + metrics.backlog + ' · Заплановано: ' + metrics.scheduled,
      href: '/dashboard/requests',
      icon: Icons.kanban
    },
    {
      title: 'Замовлення в роботі',
      value: String(metrics.inProgress),
      description: 'Усі відкриті замовлення: ' + money(metrics.activeValueCents),
      href: '/dashboard/orders',
      icon: Icons.product
    },
    {
      title: 'Готові до видачі',
      value: String(metrics.ready),
      description: 'Прострочених прийомів і видач: ' + metrics.overdue,
      href: '/dashboard/kanban',
      icon: Icons.check
    },
    {
      title: 'Видано цього місяця',
      value: String(metrics.deliveredThisMonth),
      description: 'Вартість замовлень: ' + money(metrics.deliveredValueCents),
      href: '/dashboard/orders',
      icon: Icons.billing
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
            <span className='flex items-center gap-1.5'>
              <Icons.add data-icon='inline-start' />
              Нова заявка
            </span>
          </Button>
          <Button size='sm' variant='outline' onClick={() => setEditor({ type: 'order' })}>
            Нове замовлення
          </Button>
          <Button size='sm' variant='outline' onClick={() => setEditor({ type: 'customer' })}>
            Додати клієнта
          </Button>
          <Button size='sm' variant='outline' onClick={() => setEditor({ type: 'vehicle' })}>
            Додати авто
          </Button>
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
      <div className='grid min-w-0 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-4'>
        {cards.map(({ title, value, description, href, icon: Icon }) => (
          <Card key={title} className='relative min-w-0'>
            <CardHeader>
              <CardDescription>{title}</CardDescription>
              <CardTitle className='text-3xl font-semibold tabular-nums'>
                <Link
                  href={href}
                  aria-label={title + ': ' + value}
                  className='after:absolute after:inset-0 after:rounded-xl after:focus-visible:ring-2 after:focus-visible:ring-ring'
                >
                  {value}
                </Link>
              </CardTitle>
              <CardAction>
                <Icon aria-hidden className='size-5 text-muted-foreground' />
              </CardAction>
            </CardHeader>
            <CardFooter className='min-h-14 items-start text-xs text-muted-foreground'>
              {description}
            </CardFooter>
          </Card>
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
