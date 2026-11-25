'use server';

import { z } from 'zod';
import { getOrganizationContext } from '@/features/crm/server/organization';
import { CrmError } from '@/features/crm/server/repository';
import { overviewPeriodMetrics, overviewPeriodTrends } from '../lib/period-metrics';
import { overviewPeriodSchema, type OverviewPeriod } from '../schemas/period';
import { currentOverviewMonth } from '../lib/period';
import type { OverviewReport } from './types';

export async function getOverview(
  orgId: string,
  today: string,
  input: OverviewPeriod = currentOverviewMonth(today)
): Promise<OverviewReport> {
  const { access, repository, team } = await getOrganizationContext();
  if (access.orgId !== orgId || access.role !== 'admin')
    throw new CrmError('Огляд доступний адміністратору поточної автомалярки');
  z.iso.date().parse(today);
  const period = overviewPeriodSchema.parse(input);
  const source = repository.reads.overviewSource();
  const metrics = overviewPeriodMetrics(source, today, period);
  const trends = overviewPeriodTrends(source, today, period, metrics);
  const queueCounts = { attention: metrics.attention.length, schedule: metrics.schedule.length };
  metrics.attention = metrics.attention.slice(0, 10);
  metrics.schedule = metrics.schedule.slice(0, 10);
  const ids = [
    ...new Set([
      ...metrics.recentOrders.map((order) => order.id),
      ...metrics.attention.map((target) => target.record.id),
      ...metrics.schedule.map((entry) => entry.target.record.id)
    ])
  ];
  const counts = repository.reads.counts();
  return {
    period,
    metrics,
    queueCounts,
    trends,
    empty:
      !counts.customers && !counts.vehicles && !source.orders.length && !source.requests.length,
    data: { ...repository.reads.display(ids), access, team }
  };
}
