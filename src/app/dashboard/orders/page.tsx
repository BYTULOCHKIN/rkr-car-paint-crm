import { CrmPage } from '@/features/crm/components/crm-page';
export const metadata = { title: 'Замовлення' };
export const runtime = 'nodejs';
export default function Page() {
  return <CrmPage view='orders' />;
}
