import { Suspense } from 'react';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import PageContainer from '@/components/layout/page-container';
import { buttonVariants } from '@/components/ui/button';
import { getQueryClient } from '@/lib/query-client';
import { crmQueries } from '@/features/crm/api/queries';
import { checkCrmAccess } from '@/features/crm/api/service';
import { businessToday } from '@/features/crm/lib/workflow';
import Overview from '@/features/overview/components/overview';
import { OverviewSkeleton } from '@/features/overview/components/overview-skeleton';

export const metadata = { title: 'Огляд автомалярки' };

export default async function OverviewPage() {
  const { userId } = await auth.protect();
  const access = await checkCrmAccess();
  if (!access.ok)
    return (
      <PageContainer
        pageTitle='Огляд автомалярки'
        access={false}
        accessFallback={<p role='alert'>{access.error}</p>}
      >
        {null}
      </PageContainer>
    );
  const queryClient = getQueryClient();
  void queryClient.prefetchQuery(crmQueries.workspace(userId));
  return (
    <PageContainer
      pageTitle='Огляд автомалярки'
      pageDescription='Заявки, замовлення та найближчі події вашого бізнесу.'
      pageHeaderAction={
        <Link
          href='/dashboard/kanban'
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
        >
          Дошка робіт
        </Link>
      }
    >
      <HydrationBoundary state={dehydrate(queryClient)}>
        <Suspense fallback={<OverviewSkeleton />}>
          <Overview userId={userId} initialToday={businessToday()} />
        </Suspense>
      </HydrationBoundary>
    </PageContainer>
  );
}
