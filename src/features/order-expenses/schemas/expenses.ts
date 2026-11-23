import { z } from 'zod';
import { paymentSchema } from '@/features/crm/schemas/payment';

const base = {
  orgId: z.string().min(1).max(255),
  orderId: z.uuid(),
  operationId: z.uuid(),
  expectedRevision: z.number().int().nonnegative()
};
export const orderExpenseSchema = z
  .object({
    ...base,
    id: z.string().min(1).max(255).optional(),
    kind: z.enum(['color_matching', 'soldering', 'other']),
    description: z.string().trim().min(1, 'Вкажіть витрату').max(300),
    contractorName: z.string().trim().min(1, 'Вкажіть підрядника').max(120),
    amount: paymentSchema.shape.amount
  })
  .strict();
export const removeOrderExpenseSchema = z
  .object({ ...base, id: z.string().min(1).max(255) })
  .strict();
export type OrderExpenseInput = z.infer<typeof orderExpenseSchema>;
export type RemoveOrderExpenseInput = z.infer<typeof removeOrderExpenseSchema>;
