import type { CrmWorkspace } from '@/features/crm/api/types';
import type { OverviewPeriodMetrics } from '../lib/period-metrics';
import type { OverviewPeriod } from '../schemas/period';
import type { PeriodTrends } from '../lib/period-metrics';

export interface OverviewReport {
  data: CrmWorkspace;
  period: OverviewPeriod;
  metrics: OverviewPeriodMetrics;
  trends: PeriodTrends;
  empty: boolean;
  queueCounts: { attention: number; schedule: number };
}
