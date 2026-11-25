import type { OverviewOrderMetric } from '@/features/overview/schemas/period';
import { redirect } from 'next/navigation';
import { getOrganizationContext } from '@/features/crm/server/organization';
import Link from 'next/link';
import { OrganizationBoundary } from '@/features/crm/components/organization-boundary';
import { Suspense } from 'react';
import { auth } from '@clerk/nextjs/server';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import PageContainer from '@/components/layout/page-container';
import { Skeleton } from '@/components/ui/skeleton';
import { getQueryClient } from '@/lib/query-client';
import { crmQueries } from '../api/queries';
import { checkCrmAccess } from '../api/service';
import type { CrmView } from '../api/types';
import { CrmWorkspaceView } from './workspace';
import { readCrmList } from '../server/read-service';
import { CrmKanbanBoard } from './kanban-board';
import { VehiclesView } from './vehicles-view';

interface CrmPageProps {
  view: CrmView;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const copy = {
  vehicles: ['Автомобілі', 'Довідник автомобілів, пошук за VIN і створення з відкритого каталогу.'],
  kanban: ['Дошка робіт', 'Замовлення: створено, в роботі, готово.'],
  customers: ['Клієнти', 'Контакти клієнтів і закріплені за ними автомобілі.'],
  requests: [
    'Архів заявок',
    'Попередні заявки та їхня історія. Нові записи створюються як замовлення.'
  ],
  orders: ['Замовлення', 'Автомобілі в роботі, перелік робіт і вартість за позиціями.']
};

export async function CrmPage({ view, searchParams }: CrmPageProps) {
  const { userId, orgId } = await auth.protect();
  const access = await checkCrmAccess();
  if (!access.ok)
    return (
      <PageContainer
        pageTitle={copy[view][0]}
        access={false}
        accessFallback={
          <div className='flex flex-col items-center gap-3'>
            <p role='alert'>{access.error}</p>
            <Link href='/dashboard/workspaces' className='underline'>
              Обрати або створити автомалярку
            </Link>
          </div>
        }
      >
        {null}
      </PageContainer>
    );
  if (
    (await getOrganizationContext()).access.role === 'worker' &&
    !['orders', 'kanban'].includes(view)
  )
    redirect('/dashboard/orders');
  const queryClient = getQueryClient();
  void queryClient.prefetchQuery(crmQueries.team(userId, orgId!));
  const params = (await searchParams) ?? {};
  const text = (key: string) =>
    typeof params[key] === 'string' ? (params[key] as string) : undefined;
  const positive = (key: string, fallback: number, max: number) =>
    Math.min(max, Math.max(1, parseInt(text(key) ?? '', 10) || fallback));
  const filters = {
    entity: view,
    ...(view === 'orders' && text('overviewMetric')
      ? {
          overviewMetric: text('overviewMetric') as OverviewOrderMetric,
          overviewFrom: text('overviewFrom'),
          overviewTo: text('overviewTo')
        }
      : {}),
    search: text('q') ?? '',
    page: positive('page', 1, 1_000_000),
    pageSize: positive('perPage', 10, 100),
    status: (view === 'requests'
      ? text('requestStatus') === 'backlog'
        ? 'backlog'
        : 'all'
      : ['created', 'in_progress', 'ready'].includes(text('orderStatus') ?? '')
        ? text('orderStatus')
        : 'all') as 'all' | 'created' | 'in_progress' | 'ready' | 'backlog',
    customerOrder: text('customerOrder') === 'oldest' ? ('oldest' as const) : ('newest' as const),
    sort: text('sort')
  };
  if (view === 'kanban')
    void queryClient.prefetchInfiniteQuery({
      ...crmQueries.board(userId, orgId!, ''),
      queryFn: ({ pageParam }) =>
        readCrmList(orgId!, { entity: 'kanban', search: '', page: pageParam, pageSize: 25 })
    });
  else {
    const listFilters =
      view === 'vehicles'
        ? {
            entity: view,
            search: filters.search,
            page: filters.page,
            pageSize: filters.pageSize,
            sort: filters.sort
          }
        : filters;
    void queryClient.prefetchQuery({
      ...crmQueries.list(userId, orgId!, listFilters),
      queryFn: () => readCrmList(orgId!, listFilters)
    });
  }
  const content = (
    <OrganizationBoundary orgId={orgId ?? null}>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <Suspense fallback={<Skeleton className='h-80 w-full' />}>
          {view === 'vehicles' ? (
            <VehiclesView userId={userId} orgId={orgId} />
          ) : view === 'kanban' ? (
            <CrmKanbanBoard userId={userId} orgId={orgId} />
          ) : (
            <CrmWorkspaceView view={view} userId={userId} orgId={orgId} />
          )}
        </Suspense>
      </HydrationBoundary>
    </OrganizationBoundary>
  );
  return ['customers', 'orders'].includes(view) ? (
    content
  ) : (
    <PageContainer pageTitle={copy[view][0]} pageDescription={copy[view][1]}>
      {content}
    </PageContainer>
  );
}
