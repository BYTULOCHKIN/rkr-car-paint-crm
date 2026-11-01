'use client';

import { CrmErrorView } from '@/features/crm/components/error';

export default function OverviewError({ reset }: { reset: () => void }) {
  return <CrmErrorView reset={reset} />;
}
