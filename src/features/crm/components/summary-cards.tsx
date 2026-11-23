import { isCompletedStatus } from '@/features/crm/lib/workflow';
import { SummaryCardLink } from '@/components/summary-card-link';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';
import {
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
      icon: Icons.customers
    },
    {
      title: 'Створені замовлення',
      count: data.orders.filter((order) => order.status === 'created').length,
      href: '/dashboard/orders?orderStatus=created',
      description: 'Очікують початку робіт',
      icon: Icons.orders
    },
    {
      title: 'Замовлення в роботі',
      count: data.orders.filter((order) => !isCompletedStatus(order.status)).length,
      href: '/dashboard/orders',
      description: `Готово: ${data.orders.filter((order) => order.status === 'ready').length}`,
      icon: Icons.orders
    }
  ];
  return (
    <div
      className={cn(
        'grid gap-4 sm:grid-cols-3',
        compactOnMobile ? 'grid-cols-3 gap-2 sm:gap-4' : 'grid-cols-1'
      )}
    >
      {cards.map(({ title, count, href, description, icon: Icon }) => (
        <SummaryCardLink
          key={href}
          href={href}
          label={`${title}: ${count}`}
          className='@container/card'
        >
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
              {count}
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
        </SummaryCardLink>
      ))}
    </div>
  );
}
