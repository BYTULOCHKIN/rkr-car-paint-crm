import type { CrmWorkspace } from '@/features/crm/api/types';
import type { OverviewMetrics } from '../lib/metrics';
import type { OverviewTrends } from '../lib/trends';

export interface OverviewReport {
  data: CrmWorkspace;
  metrics: OverviewMetrics;
  trends: OverviewTrends;
  empty: boolean;
  queueCounts: { attention: number; schedule: number };
}
