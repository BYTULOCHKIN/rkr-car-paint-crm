import { z } from 'zod';
import { stockUnits } from '../constants/units';
import { stockTags } from '../constants/tags';

export const stockTagsSchema = z
  .array(z.enum(stockTags, { error: 'Оберіть тег зі списку' }))
  .min(1, 'Оберіть хоча б один тег')
  .max(stockTags.length)
  .refine((tags) => new Set(tags).size === tags.length, 'Теги не можуть повторюватися');

export const stockUnitSchema = z.enum(stockUnits, { error: 'Оберіть одиницю: шт, л, кг або м' });

const itemFields = z
  .object({
    name: z.string().trim().min(1, 'Вкажіть назву').max(120),
    unit: z.string().trim().max(20),
    accountingMode: z.enum(['quantity', 'amount']).optional(),
    notes: z.string().trim().max(1000),
    // Older clients omit tags: create defaults to Розхідник; edits preserve the saved tags.
    tags: stockTagsSchema.optional()
  })
  .strict();
export const itemSchema = itemFields.superRefine((value, context) => {
  if (value.accountingMode !== 'amount' && !stockUnitSchema.safeParse(value.unit).success)
    context.addIssue({
      code: 'custom',
      path: ['unit'],
      message: 'Оберіть одиницю: шт, л, кг або м'
    });
});

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
const amount = z
  .string()
  .trim()
  .regex(/^\d{1,10}([.,]\d{1,2})?$/, 'Вкажіть суму, до 2 знаків після коми');
const exchangeRate = z
  .string()
  .trim()
  .regex(/^\d{1,5}([.,]\d{1,6})?$/, 'Вкажіть курс, до 6 знаків після коми')
  .refine((value) => decimalScaled(value, 6) > 0, 'Курс має бути додатним');
/** Convert a validated decimal string to integer minor units without float multiplication. */
export function decimalScaled(value: string, digits: number): number {
  const [whole, fraction = ''] = value.replace(',', '.').split('.');
  return Number(whole) * 10 ** digits + Number(fraction.padEnd(digits, '0'));
}
const pricing = {
  totalAmount: amount,
  currency: z.enum(['UAH', 'EUR']),
  exchangeRate
};
export const receiptSchema = z
  .object({ ...baseMovement, quantity, ...pricing })
  .strict()
  .refine((value) => value.currency !== 'UAH' || decimalScaled(value.exchangeRate, 6) === 1000000, {
    path: ['exchangeRate'],
    message: 'Для гривні курс має дорівнювати 1'
  });
export const adjustmentSchema = z
  .object({
    ...baseMovement,
    quantity: delta,
    totalAmount: z.string().trim().default(''),
    currency: z.enum(['UAH', 'EUR']).default('UAH'),
    exchangeRate: z.string().trim().default('1'),
    note: z.string().trim().min(1, 'Вкажіть причину коригування').max(1000)
  })
  .strict()
  .superRefine((value, context) => {
    if (quantityMilli(value.quantity) > 0) {
      const result = receiptSchema.safeParse(value);
      if (!result.success)
        for (const issue of result.error.issues)
          context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
    } else if (value.totalAmount !== '' || value.currency !== 'UAH' || value.exchangeRate !== '1') {
      context.addIssue({
        code: 'custom',
        path: ['totalAmount'],
        message: 'Зменшення оцінюється за середньою собівартістю; ціну вводити не потрібно'
      });
    }
  });
export function materialAmountCents(value: string): number | null {
  if (!/^\d{1,10}([.,]\d{1,2})?$/.test(value.trim())) return null;
  const cents = decimalScaled(value.trim(), 2);
  return cents > 0 && Number.isSafeInteger(cents) ? cents : null;
}

function validateConsumption(
  value: { quantity: string; amount?: string },
  context: z.RefinementCtx
): void {
  if (value.amount || (value.amount !== undefined && !value.quantity)) {
    if (materialAmountCents(value.amount ?? '') === null)
      context.addIssue({
        code: 'custom',
        path: ['amount'],
        message: 'Вкажіть додатну суму, до 2 знаків після коми'
      });
    if (value.quantity)
      context.addIssue({
        code: 'custom',
        path: ['quantity'],
        message: 'Вкажіть кількість або суму витрати'
      });
  } else {
    const result = quantity.safeParse(value.quantity);
    if (!result.success)
      context.addIssue({
        code: 'custom',
        path: ['quantity'],
        message: 'Вкажіть додатну кількість або суму витрати'
      });
  }
}
const consumptionFields = z
  .object({
    ...baseMovement,
    quantity: z.string().trim(),
    amount: z.string().trim().optional(),
    orderId: z.uuid(),
    category: z.enum(['painting', 'polishing']).default('painting')
  })
  .strict();
export const consumptionSchema = consumptionFields.superRefine(validateConsumption);
export const batchConsumptionSchema = z
  .object({
    operationId: z.uuid(),
    orderId: z.uuid(),
    rows: z
      .array(
        consumptionFields
          .omit({ operationId: true, orderId: true })
          .extend({ category: z.enum(['painting', 'polishing']) })
          .superRefine(validateConsumption)
      )
      .min(1, 'Додайте матеріал')
      .max(100, 'До 100 матеріалів за одне збереження')
  })
  .strict();
export const editConsumptionSchema = consumptionFields
  .extend({ movementId: z.uuid() })
  .strict()
  .superRefine(validateConsumption);
export type EditConsumptionInput = z.input<typeof editConsumptionSchema>;
export const valuationSchema = z
  .object({
    ...baseMovement,
    totalAmount: amount,
    expectedBalanceMilli: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    expectedRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    note: z.string().trim().min(1, 'Вкажіть підставу оцінювання').max(1000)
  })
  .strict();
export const reversalSchema = z
  .object({
    movementId: z.uuid(),
    operationId: z.uuid(),
    note: z.string().trim().min(1, 'Вкажіть причину скасування').max(1000)
  })
  .strict();
// Existing units with movements must retain their meaning; repository validates changes.
export const updateItemSchema = itemFields.omit({ unit: true }).extend({
  id: z.uuid(),
  unit: z.string().trim().max(20)
});
export const archiveSchema = z.object({ id: z.uuid(), archived: z.boolean() }).strict();

export type ItemInput = z.infer<typeof itemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ReceiptInput = z.infer<typeof receiptSchema>;
export type AdjustmentInput = z.input<typeof adjustmentSchema>;
export type ConsumptionInput = z.input<typeof consumptionSchema>;
export type BatchConsumptionInput = z.input<typeof batchConsumptionSchema>;
export type ReversalInput = z.infer<typeof reversalSchema>;
export type ValuationInput = z.infer<typeof valuationSchema>;
