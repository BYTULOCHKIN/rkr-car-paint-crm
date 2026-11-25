import { overviewOrderMetrics, overviewPeriodSchema } from '@/features/overview/schemas/period';
import { z } from 'zod';
import { paginationSchema } from '../lib/pagination';

export const crmListSchema = paginationSchema
  .extend({
    overviewMetric: z.enum(overviewOrderMetrics).optional(),
    overviewFrom: z.iso.date().optional(),
    overviewTo: z.iso.date().optional(),
    entity: z.enum(['customers', 'vehicles', 'orders', 'requests', 'kanban']),
    search: z.string().trim().max(500).default(''),
    status: z.enum(['all', 'created', 'in_progress', 'ready', 'backlog']).default('all'),
    customerOrder: z.enum(['newest', 'oldest']).default('newest'),
    sort: z.string().max(1000).optional(),
    customerId: z.string().uuid().optional(),
    vehicleId: z.string().uuid().optional(),
    trash: z.boolean().default(false),
    lookup: z.boolean().default(false)
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.overviewMetric && !value.overviewFrom && !value.overviewTo) return;
    if (
      value.entity !== 'orders' ||
      !value.overviewMetric ||
      !value.overviewFrom ||
      !value.overviewTo ||
      !overviewPeriodSchema.safeParse({ from: value.overviewFrom, to: value.overviewTo }).success
    )
      context.addIssue({
        code: 'custom',
        path: ['overviewMetric'],
        message: 'Перевірте відбір замовлень з огляду'
      });
  });

export type CrmListFilters = z.input<typeof crmListSchema>;

export interface WorkspaceSelection {
  orderIds: string[];
  customerIds: string[];
  vehicleIds: string[];
  requestIds: string[];
  history?: boolean;
  payments?: boolean;
  finance?: boolean;
  summaryOnly?: boolean;
  includeTrashed?: boolean;
}
