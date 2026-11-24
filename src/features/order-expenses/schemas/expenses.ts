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
    expenseNameId: z.string().min(1, 'Виберіть назву витрати').max(255),
    contractorUserId: z.string().min(1, 'Виберіть субпідрядника з команди').max(255),
    note: z.string().trim().max(1000),
    amount: paymentSchema.shape.amount
  })
  .strict();
export const removeOrderExpenseSchema = z
  .object({ ...base, id: z.string().min(1).max(255) })
  .strict();
export type OrderExpenseInput = z.infer<typeof orderExpenseSchema>;
export type RemoveOrderExpenseInput = z.infer<typeof removeOrderExpenseSchema>;

export const createExpenseNameSchema = z
  .object({ orgId: base.orgId, name: z.string().trim().min(1, 'Вкажіть назву витрати').max(120) })
  .strict();
export type CreateExpenseNameInput = z.infer<typeof createExpenseNameSchema>;
