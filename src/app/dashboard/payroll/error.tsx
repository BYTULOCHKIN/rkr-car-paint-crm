'use client';

import { CrmErrorView } from '@/features/crm/components/error';

export default function PayrollError({ reset }: { reset: () => void }) {
  return <CrmErrorView reset={reset} />;
}
