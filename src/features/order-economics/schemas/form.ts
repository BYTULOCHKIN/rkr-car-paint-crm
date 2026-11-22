import { z } from 'zod';
import { economicsDetailsSchema, workKinds } from './details';
import { decimalScaled } from '@/features/inventory/schemas/inventory';
import type { OrderEconomicsDetails } from '../api/types';
import type { RepairOrder } from '@/features/crm/api/types';

const amount = z
  .string()
  .trim()
  .regex(/^\d{1,7}([.,]\d{1,2})?$/, 'Вкажіть суму, до 2 знаків після коми');
const rawFormSchema = z.object({
  painterId: z.string(),
  polisherId: z.string(),
  assemblerId: z.string(),
  share: z
    .string()
    .trim()
    .regex(/^\d{1,3}([.,]\d{1,2})?$/, 'Вкажіть ставку від 0 до 100%'),
  lines: z
    .array(
      z.object({
        id: z.uuid(),
        kind: z.enum(['unclassified', ...workKinds]),
        description: z.string().trim().min(1, 'Вкажіть роботу').max(300),
        quantity: z.number().int().min(1).max(999),
        price: amount,
        polishing: z.string().trim(),
        subcontractCost: z.string().trim(),
        contractorName: z.string().trim().max(120)
      })
    )
    .min(1)
    .max(100)
});
export type DetailedCheckFormValues = z.infer<typeof rawFormSchema>;

function convert(value: DetailedCheckFormValues): OrderEconomicsDetails {
  return {
    painterId: value.painterId,
    polisherId: value.polisherId,
    assemblerId: value.assemblerId,
    employeeShareBps: decimalScaled(value.share, 2),
    lines: value.lines.map((line) => {
      if (line.kind === 'unclassified') throw new Error('Виберіть вид кожної роботи');
      const unitPriceCents = decimalScaled(line.price, 2);
      const subcontract = !['painting', 'assembly'].includes(line.kind);
      return {
        id: line.id,
        kind: line.kind,
        description: line.description,
        quantity: line.quantity,
        unitPriceCents,
        polishingCents: line.kind === 'painting' ? decimalScaled(line.polishing, 2) : 0,
        subcontractCostCents:
          line.kind === 'color_matching'
            ? unitPriceCents * line.quantity
            : subcontract
              ? decimalScaled(line.subcontractCost, 2)
              : 0,
        contractorName: subcontract ? line.contractorName : ''
      };
    })
  };
}

export const detailedCheckFormSchema = rawFormSchema.superRefine((value, context) => {
  let invalidAmount = false;
  for (const [index, line] of value.lines.entries()) {
    const field =
      line.kind === 'painting'
        ? 'polishing'
        : line.kind === 'soldering' || line.kind === 'other'
          ? 'subcontractCost'
          : null;
    if (field && !amount.safeParse(line[field]).success) {
      invalidAmount = true;
      context.addIssue({
        code: 'custom',
        path: ['lines', index, field],
        message: 'Вкажіть суму, до 2 знаків після коми'
      });
    }
  }
  for (const [index, line] of value.lines.entries())
    if (line.kind === 'unclassified') {
      context.addIssue({
        code: 'custom',
        path: ['lines', index, 'kind'],
        message: 'Виберіть вид роботи'
      });
    }
  if (invalidAmount || value.lines.some((line) => line.kind === 'unclassified')) return;
  const result = economicsDetailsSchema.safeParse(convert(value));
  if (!result.success)
    for (const issue of result.error.issues) {
      const path = issue.path.map((key) =>
        key === 'unitPriceCents'
          ? 'price'
          : key === 'polishingCents'
            ? 'polishing'
            : key === 'subcontractCostCents'
              ? 'subcontractCost'
              : key === 'employeeShareBps'
                ? 'share'
                : key
      );
      context.addIssue({ code: 'custom', path, message: issue.message });
    }
});

export function formLineTotalCents(price: string, quantity: number): number {
  if (
    !amount.safeParse(price).success ||
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    quantity > 999
  )
    return 0;
  return decimalScaled(price.trim(), 2) * quantity;
}

export function formToEconomics(value: DetailedCheckFormValues): OrderEconomicsDetails {
  return convert(detailedCheckFormSchema.parse(value));
}

export function initialDetailedCheck(order: RepairOrder): DetailedCheckFormValues {
  const details = order.economics;
  return {
    painterId: details?.painterId ?? '',
    polisherId: details?.polisherId ?? '',
    assemblerId: details?.assemblerId ?? '',
    share: String((details?.employeeShareBps ?? 6000) / 100),
    lines: details
      ? details.lines.map((line) => ({
          id: line.id,
          kind: line.kind,
          description: line.description,
          quantity: line.quantity,
          price: (line.unitPriceCents / 100).toFixed(2),
          polishing: (line.polishingCents / 100).toFixed(2),
          subcontractCost: (line.subcontractCostCents / 100).toFixed(2),
          contractorName: line.contractorName
        }))
      : order.items.map((item) => ({
          id: crypto.randomUUID(),
          kind: 'unclassified',
          description: item.description,
          quantity: item.quantity,
          price: (item.unitPriceCents / 100).toFixed(2),
          polishing: '0',
          subcontractCost: '0',
          contractorName: ''
        }))
  };
}
