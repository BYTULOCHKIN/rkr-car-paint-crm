import Link from 'next/link';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import type { CrmWorkspace } from '../api/types';

interface SummaryCardsProps {
  data: CrmWorkspace;
  compactOnMobile?: boolean;
}

export function SummaryCards({ data, compactOnMobile = false }: SummaryCardsProps) {
  const cards = [
    {
      title: 'Клієнти',
      count: data.customers.length,
      href: '/dashboard/clients',
      description: `Автомобілів у базі: ${data.vehicles.length}`,
      icon: Icons.teams
    },
    {
      title: 'Активні заявки',
      count: data.requests.filter((request) => request.status !== 'converted').length,
      href: '/dashboard/requests',
      description: `Заплановано: ${data.requests.filter((request) => request.status === 'scheduled').length}`,
      icon: Icons.kanban
    },
    {
      title: 'Замовлення в роботі',
      count: data.orders.filter((order) => order.status !== 'delivered').length,
      href: '/dashboard/orders',
      description: `Готові до видачі: ${data.orders.filter((order) => order.status === 'ready').length}`,
      icon: Icons.product
    }
  ];
  return (
    <div
      className={cn(
        'grid gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-3',
        compactOnMobile ? 'grid-cols-3 gap-2 sm:gap-4' : 'grid-cols-1'
      )}
    >
      {cards.map(({ title, count, href, description, icon: Icon }) => (
        <Card key={href} className='@container/card relative min-w-0'>
          <CardHeader className={cn(compactOnMobile && 'px-3 pb-3 sm:px-4 sm:pb-0')}>
            <CardDescription
              className={cn(compactOnMobile && 'min-h-8 text-xs sm:min-h-0 sm:text-sm')}
            >
              {title}
            </CardDescription>
            <CardTitle
              className={cn(
                'text-2xl font-semibold tabular-nums @[250px]/card:text-3xl',
                compactOnMobile && 'col-start-1 row-start-2'
              )}
            >
              <Link
                href={href}
                className='after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none after:focus-visible:ring-2 after:focus-visible:ring-ring'
                aria-label={`${title}: ${count}`}
              >
                {count}
              </Link>
            </CardTitle>
            <CardAction className={cn(compactOnMobile && 'hidden sm:block')}>
              <Icon aria-hidden className='text-muted-foreground size-5' />
            </CardAction>
          </CardHeader>
          <CardFooter
            className={cn(
              'items-start text-sm text-muted-foreground',
              compactOnMobile && 'hidden sm:flex'
            )}
          >
            {description}
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
