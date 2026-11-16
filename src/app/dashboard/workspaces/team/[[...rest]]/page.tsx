import Link from 'next/link';
import { Suspense } from 'react';
import { auth } from '@clerk/nextjs/server';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import PageContainer from '@/components/layout/page-container';
import { Skeleton } from '@/components/ui/skeleton';
import { getQueryClient } from '@/lib/query-client';
import { checkCrmAccess } from '@/features/crm/api/service';
import { crmQueries } from '@/features/crm/api/queries';
import { TeamView } from '@/features/crm/components/team-view';
import { OrganizationBoundary } from '@/features/crm/components/organization-boundary';

export default async function Page() {
  const { userId, orgId } = await auth.protect();
  const access = await checkCrmAccess();
  if (!orgId || !access.ok)
    return (
      <PageContainer pageTitle='Команда'>
        <p role='alert'>{!access.ok ? access.error : 'Оберіть автомалярку.'}</p>
        <Link href='/dashboard/workspaces' className='underline'>
          Обрати автомалярку
        </Link>
      </PageContainer>
    );
  const client = getQueryClient();
  void client.prefetchQuery(crmQueries.team(userId, orgId));
  return (
    <PageContainer pageTitle='Команда' pageDescription='Учасники автомалярки, ролі та запрошення.'>
      <OrganizationBoundary orgId={orgId}>
        <HydrationBoundary state={dehydrate(client)}>
          <Suspense fallback={<Skeleton className='h-64 w-full' />}>
            <TeamView userId={userId} orgId={orgId} />
          </Suspense>
        </HydrationBoundary>
      </OrganizationBoundary>
    </PageContainer>
  );
}
