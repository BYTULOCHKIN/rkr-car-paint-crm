import { CrmPage } from '@/features/crm/components/crm-page';
export const metadata = { title: 'Клієнти' };
export const runtime = 'nodejs';
export default function Page({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <CrmPage searchParams={searchParams} view='customers' />;
}
