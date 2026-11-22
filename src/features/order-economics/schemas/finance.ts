import { z } from 'zod';
import { economicsDetailsSchema } from './details';
import { paymentSchema } from '@/features/crm/schemas/payment';
import { consumptionSchema } from '@/features/inventory/schemas/inventory';

const base = { orgId: z.string().min(1).max(255), orderId: z.uuid(), operationId: z.uuid() };
const reason = z.string().trim().min(1, 'Вкажіть причину').max(1000);
export const cashSettlementSchema = z
  .object({
    ...base,
    payeeKind: z.enum(['worker', 'contractor']),
    payeeId: z.string().min(1).max(255),
    kind: z.enum(['payout', 'return']),
    amount: paymentSchema.shape.amount,
    note: z.string().trim().max(1000)
  })
  .strict();
export const reverseSettlementSchema = z
  .object({ orgId: base.orgId, operationId: z.uuid(), eventId: z.uuid(), note: reason })
  .strict();
export const correctionSchema = z
  .object({
    ...base,
    expectedRevision: z.number().int().nonnegative(),
    expectedPostingRevision: z.number().int().nonnegative(),
    expectedInventoryRevision: z.string().length(64),
    details: economicsDetailsSchema,
    note: reason,
    materials: z
      .array(
        z.discriminatedUnion('kind', [
          z
            .object({
              kind: z.literal('consume'),
              itemId: z.uuid(),
              quantity: consumptionSchema.shape.quantity,
              category: z.enum(['painting', 'polishing'])
            })
            .strict(),
          z.object({ kind: z.literal('reverse'), movementId: z.uuid() }).strict()
        ])
      )
      .max(20)
  })
  .strict();
export const financeSettingsSchema = z
  .object({
    orgId: base.orgId,
    employeeShareBps: z.number().int().min(0).max(10000),
    expectedRevision: z.number().int().nonnegative()
  })
  .strict();
export type CashSettlementInput = z.infer<typeof cashSettlementSchema>;
export type ReverseSettlementInput = z.infer<typeof reverseSettlementSchema>;
export type CorrectionInput = z.infer<typeof correctionSchema>;
