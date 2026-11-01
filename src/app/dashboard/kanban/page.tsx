import { auth } from '@clerk/nextjs/server';
import { CrmPage } from '@/features/crm/components/crm-page';

export const metadata = {
  title: 'Дошка робіт'
};

export default async function page() {
  await auth.protect();

  return <CrmPage view='kanban' />;
}
