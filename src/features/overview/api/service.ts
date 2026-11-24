'use server';

import { z } from 'zod';
import { getOrganizationContext } from '@/features/crm/server/organization';
import { CrmError } from '@/features/crm/server/repository';
import { overviewMetrics } from '../lib/metrics';
import { overviewTrends } from '../lib/trends';
import type { OverviewReport } from './types';

export async function getOverview(orgId: string, today: string): Promise<OverviewReport> {
  const { access, repository, team } = await getOrganizationContext();
  if (access.orgId !== orgId || access.role !== 'admin')
    throw new CrmError('Огляд доступний адміністратору поточної автомалярки');
  z.iso.date().parse(today);
  const source = repository.reads.overviewSource();
  const metrics = overviewMetrics(source, today);
  const trends = overviewTrends(source, today, metrics);
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
    metrics,
    queueCounts,
    trends,
    empty:
      !counts.customers && !counts.vehicles && !source.orders.length && !source.requests.length,
    data: { ...repository.reads.display(ids), access, team }
  };
}
