'use client';
import { CrmErrorView } from '@/features/crm/components/error';
export default function ReportsError({ reset }: { reset: () => void }) {
  return <CrmErrorView reset={reset} />;
}
