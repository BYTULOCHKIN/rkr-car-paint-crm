import { z } from 'zod';

export const paymentSchema = z.object({
  orderId: z.uuid(),
  operationId: z.uuid(),
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,10}([.,]\d{1,2})?$/, 'Вкажіть суму з точністю до копійок')
    .refine((value) => Number(value.replace(',', '.')) > 0, 'Сума має бути більшою за нуль'),
  note: z.string().trim().max(1000)
});
export const reversePaymentSchema = z.object({
  paymentId: z.uuid(),
  operationId: z.uuid(),
  note: z.string().trim().min(1, 'Вкажіть причину скасування').max(1000)
});
export type PaymentInput = z.infer<typeof paymentSchema>;
export type ReversePaymentInput = z.infer<typeof reversePaymentSchema>;
