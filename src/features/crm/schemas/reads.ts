import { z } from 'zod';
import { paginationSchema } from '../lib/pagination';

export const crmListSchema = paginationSchema
  .extend({
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
  .strict();

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
