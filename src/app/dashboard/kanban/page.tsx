import { auth } from '@clerk/nextjs/server';
import { CrmPage } from '@/features/crm/components/crm-page';

export const metadata = {
  title: 'Дошка робіт'
};

export default async function Page({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await auth.protect();

  return <CrmPage searchParams={searchParams} view='kanban' />;
}
