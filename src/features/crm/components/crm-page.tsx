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
import { CrmKanbanBoard } from './kanban-board';
import { VehiclesView } from './vehicles-view';

interface CrmPageProps {
  view: CrmView;
}

const copy = {
  vehicles: ['Автомобілі', 'Довідник автомобілів, пошук за VIN і створення з відкритого каталогу.'],
  kanban: ['Дошка робіт', 'Заявки, замовлення та планові й фактичні дати на одній дошці.'],
  customers: ['Клієнти', 'Контакти клієнтів і закріплені за ними автомобілі.'],
  requests: [
    'Заявки',
    'Попередні записи в backlog. Беріть автомобіль у роботу, коли будете готові.'
  ],
  orders: ['Замовлення', 'Автомобілі в роботі, перелік робіт і вартість за позиціями.']
};

export async function CrmPage({ view }: CrmPageProps) {
  const { userId } = await auth.protect();
  const access = await checkCrmAccess();
  if (!access.ok)
    return (
      <PageContainer
        pageTitle={copy[view][0]}
        access={false}
        accessFallback={<p role='alert'>{access.error}</p>}
      >
        {null}
      </PageContainer>
    );
  const queryClient = getQueryClient();
  void queryClient.prefetchQuery(crmQueries.workspace(userId));
  return (
    <PageContainer pageTitle={copy[view][0]} pageDescription={copy[view][1]}>
      <HydrationBoundary state={dehydrate(queryClient)}>
        <Suspense fallback={<Skeleton className='h-80 w-full' />}>
          {view === 'vehicles' ? (
            <VehiclesView userId={userId} />
          ) : view === 'kanban' ? (
            <CrmKanbanBoard userId={userId} />
          ) : (
            <CrmWorkspaceView view={view} userId={userId} />
          )}
        </Suspense>
      </HydrationBoundary>
    </PageContainer>
  );
}
