import { Suspense } from 'react';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import PageContainer from '@/components/layout/page-container';
import { Skeleton } from '@/components/ui/skeleton';
import { getQueryClient } from '@/lib/query-client';
import { checkCrmAccess } from '@/features/crm/api/service';
import { businessToday } from '@/features/crm/lib/workflow';
import { OrganizationBoundary } from '@/features/crm/components/organization-boundary';
import { defaultPayrollFilters, payrollFiltersSchema } from '@/features/payroll/schemas/filters';
import { payrollQueries } from '@/features/payroll/api/queries';
import { PayrollView } from '@/features/payroll/components/payroll-view';

export const metadata = { title: 'Зарплати' };

export default async function PayrollPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId, orgId } = await auth.protect();
  const access = await checkCrmAccess();
  if (!access.ok || !orgId)
    return (
      <PageContainer pageTitle='Зарплати'>
        <p role='alert'>{!access.ok ? access.error : 'Оберіть автомалярку'}</p>
        <Link href='/dashboard/workspaces' className='underline'>
          Обрати автомалярку
        </Link>
      </PageContainer>
    );
  const today = businessToday();
  const defaults = defaultPayrollFilters(today);
  const params = await searchParams;
  const first = (key: string) => (Array.isArray(params[key]) ? params[key][0] : params[key]);
  const filters = payrollFiltersSchema.safeParse({
    from: first('payrollFrom') ?? defaults.from,
    to: first('payrollTo') ?? defaults.to
  });
  const client = getQueryClient();
  if (filters.success)
    void client.prefetchQuery(payrollQueries.period(userId, orgId, filters.data));
  return (
    <PageContainer
      pageTitle='Зарплати'
      pageDescription='Заробіток команди за авто та видами робіт за вибраний період.'
    >
      <OrganizationBoundary orgId={orgId}>
        <HydrationBoundary state={dehydrate(client)}>
          <Suspense fallback={<Skeleton className='h-60 w-full' />}>
            <PayrollView userId={userId} orgId={orgId} initialToday={today} />
          </Suspense>
        </HydrationBoundary>
      </OrganizationBoundary>
    </PageContainer>
  );
}
