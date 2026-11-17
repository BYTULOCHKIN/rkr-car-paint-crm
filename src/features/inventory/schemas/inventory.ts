import { z } from 'zod';
import { stockUnits } from '../constants/units';

export const stockUnitSchema = z.enum(stockUnits, { error: 'Оберіть одиницю: шт, л, кг або м' });

export const itemSchema = z
  .object({
    name: z.string().trim().min(1, 'Вкажіть назву').max(120),
    unit: stockUnitSchema,
    notes: z.string().trim().max(1000)
  })
  .strict();

// Accept decimal commas; convert to integer thousandths without floating point arithmetic.
export function quantityMilli(value: string): number {
  const [whole, fraction = ''] = value.replace(',', '.').replace('-', '').split('.');
  return (
    (Number(whole) * 1000 + Number(fraction.padEnd(3, '0'))) * (value.startsWith('-') ? -1 : 1)
  );
}

const quantity = z
  .string()
  .trim()
  .regex(/^\d{1,6}([.,]\d{1,3})?$/, 'Вкажіть додатну кількість, до 3 знаків після коми')
  .refine((value) => quantityMilli(value) > 0, 'Кількість має бути більшою за нуль');
const delta = z
  .string()
  .trim()
  .regex(/^-?\d{1,6}([.,]\d{1,3})?$/, 'До 3 знаків після коми; мінус — зменшення залишку')
  .refine((value) => quantityMilli(value) !== 0, 'Коригування не може дорівнювати нулю');

const baseMovement = { itemId: z.uuid(), operationId: z.uuid(), note: z.string().trim().max(1000) };
export const receiptSchema = z.object({ ...baseMovement, quantity }).strict();
export const adjustmentSchema = z
  .object({
    ...baseMovement,
    quantity: delta,
    note: z.string().trim().min(1, 'Вкажіть причину коригування').max(1000)
  })
  .strict();
export const consumptionSchema = z
  .object({ ...baseMovement, quantity, orderId: z.uuid() })
  .strict();
export const reversalSchema = z
  .object({
    movementId: z.uuid(),
    operationId: z.uuid(),
    note: z.string().trim().min(1, 'Вкажіть причину скасування').max(1000)
  })
  .strict();
// Existing units with movements must retain their meaning; repository validates changes.
export const updateItemSchema = itemSchema.omit({ unit: true }).extend({
  id: z.uuid(),
  unit: z.string().trim().min(1, 'Оберіть одиницю виміру').max(20)
});
export const archiveSchema = z.object({ id: z.uuid(), archived: z.boolean() }).strict();

export type ItemInput = z.infer<typeof itemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ReceiptInput = z.infer<typeof receiptSchema>;
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;
export type ConsumptionInput = z.infer<typeof consumptionSchema>;
export type ReversalInput = z.infer<typeof reversalSchema>;
