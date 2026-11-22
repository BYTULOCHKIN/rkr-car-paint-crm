import { Suspense } from 'react';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import PageContainer from '@/components/layout/page-container';
import { Skeleton } from '@/components/ui/skeleton';
import { getQueryClient } from '@/lib/query-client';
import { checkCrmAccess } from '@/features/crm/api/service';
import { getOrganizationContext } from '@/features/crm/server/organization';
import { businessToday } from '@/features/crm/lib/workflow';
import { OrganizationBoundary } from '@/features/crm/components/organization-boundary';
import {
  defaultReportFilters,
  reportFiltersSchema
} from '@/features/workshop-reports/schemas/filters';
import { reportQueries } from '@/features/workshop-reports/api/queries';
import { ReportView } from '@/features/workshop-reports/components/report-view';

export const metadata = { title: 'Зведення за період' };

export default async function ReportsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId, orgId } = await auth.protect();
  const access = await checkCrmAccess();
  if (!access.ok || !orgId)
    return (
      <PageContainer pageTitle='Зведення за період'>
        <p role='alert'>{!access.ok ? access.error : 'Оберіть автомалярку'}</p>
        <Link href='/dashboard/workspaces' className='underline'>
          Обрати автомалярку
        </Link>
      </PageContainer>
    );
  const today = businessToday();
  const workerView = (await getOrganizationContext()).access.role === 'worker';
  const defaults = defaultReportFilters(today);
  const params = await searchParams;
  const first = (key: string) => (Array.isArray(params[key]) ? params[key][0] : params[key]);
  const filters = reportFiltersSchema.safeParse({
    from: first('reportFrom') ?? defaults.from,
    to: first('reportTo') ?? defaults.to,
    orderDate: workerView ? 'ready' : (first('reportBasis') ?? defaults.orderDate)
  });
  const client = getQueryClient();
  if (filters.success) void client.prefetchQuery(reportQueries.period(userId, orgId, filters.data));
  return (
    <PageContainer
      pageTitle='Зведення за період'
      pageDescription={
        workerView
          ? 'Ваші нарахування, виплати та залишки за довільні дати.'
          : 'Економіка авто, матеріали та розрахунки за довільні дати.'
      }
    >
      <OrganizationBoundary orgId={orgId}>
        <HydrationBoundary state={dehydrate(client)}>
          <Suspense fallback={<Skeleton className='h-60 w-full' />}>
            <ReportView
              userId={userId}
              orgId={orgId}
              initialToday={today}
              workerView={workerView}
            />
          </Suspense>
        </HydrationBoundary>
      </OrganizationBoundary>
    </PageContainer>
  );
}
