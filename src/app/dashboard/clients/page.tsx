import { CrmPage } from '@/features/crm/components/crm-page';
export const metadata = { title: 'Клієнти' };
export const runtime = 'nodejs';
export default function Page() {
  return <CrmPage view='customers' />;
}
