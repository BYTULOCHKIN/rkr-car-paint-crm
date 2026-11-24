import { Suspense } from 'react';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import PageContainer from '@/components/layout/page-container';
import { Skeleton } from '@/components/ui/skeleton';
import { getQueryClient } from '@/lib/query-client';
import { checkCrmAccess } from '@/features/crm/api/service';
import { OrganizationBoundary } from '@/features/crm/components/organization-boundary';
import { inventoryQueries } from '@/features/inventory/api/queries';
import { InventoryView } from '@/features/inventory/components/inventory-view';
import { getInventoryPage } from '@/features/inventory/api/service';
import { stockTags, type StockTag } from '@/features/inventory/constants/tags';

export const metadata = { title: 'Склад' };

export default async function InventoryPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId, orgId } = await auth.protect();
  const access = await checkCrmAccess();
  if (!access.ok || !orgId)
    return (
      <PageContainer pageTitle='Склад'>
        <p role='alert'>{!access.ok ? access.error : 'Оберіть автомалярку'}</p>
        <Link href='/dashboard/workspaces' className='underline'>
          Обрати автомалярку
        </Link>
      </PageContainer>
    );
  const client = getQueryClient();
  void client.prefetchQuery(inventoryQueries.access(userId, orgId));
  const params = await searchParams;
  const text = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : '');
  if (text('stockTab') !== 'operations') {
    const filters = {
      search: text('stockSearch'),
      tags: [
        ...new Set(
          text('stockTag')
            .split(',')
            .filter((tag): tag is StockTag => stockTags.includes(tag as StockTag))
        )
      ],
      archived: text('stockArchived') === 'true',
      page: Math.min(1_000_000, Math.max(1, parseInt(text('stockPage'), 10) || 1))
    };
    void client.prefetchQuery({
      ...inventoryQueries.items(userId, orgId, filters),
      queryFn: () => getInventoryPage(orgId, filters)
    });
  }
  return (
    <PageContainer
      pageTitle='Склад'
      pageDescription='Залишки матеріалів, надходження та історія списань.'
    >
      <OrganizationBoundary orgId={orgId}>
        <HydrationBoundary state={dehydrate(client)}>
          <Suspense fallback={<Skeleton className='h-60 w-full' />}>
            <InventoryView userId={userId} orgId={orgId} />
          </Suspense>
        </HydrationBoundary>
      </OrganizationBoundary>
    </PageContainer>
  );
}
