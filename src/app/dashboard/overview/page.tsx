import { OrganizationBoundary } from '@/features/crm/components/organization-boundary';
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
  const { userId, orgId } = await auth.protect();
  const access = await checkCrmAccess();
  if (!access.ok)
    return (
      <PageContainer
        pageTitle='Огляд автомалярки'
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
  const queryClient = getQueryClient();
  void queryClient.prefetchQuery(crmQueries.workspace(userId, orgId));
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
      <OrganizationBoundary orgId={orgId ?? null}>
        <HydrationBoundary state={dehydrate(queryClient)}>
          <Suspense fallback={<OverviewSkeleton />}>
            <Overview userId={userId} orgId={orgId} initialToday={businessToday()} />
          </Suspense>
        </HydrationBoundary>
      </OrganizationBoundary>
    </PageContainer>
  );
}
