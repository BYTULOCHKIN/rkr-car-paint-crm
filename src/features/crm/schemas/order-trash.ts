import { z } from 'zod';

export const orderTrashSchema = z
  .object({
    orgId: z.string().min(1).max(255),
    orderId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    action: z.enum(['trash', 'restore', 'delete'])
  })
  .strict();
export type OrderTrashInput = z.infer<typeof orderTrashSchema>;
