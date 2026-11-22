import { z } from 'zod';
import { sumIntegers } from '../lib/integers';

export const workKinds = ['painting', 'assembly', 'color_matching', 'soldering', 'other'] as const;
const cents = z.number().int().nonnegative().max(99900000000);
const worker = z.string().trim().max(255);
export const economicsDetailsSchema = z
  .object({
    employeeShareBps: z.number().int().min(0).max(10000),
    painterId: worker,
    polisherId: worker,
    assemblerId: worker,
    lines: z
      .array(
        z
          .object({
            id: z.uuid(),
            kind: z.enum(workKinds),
            description: z.string().trim().min(1, 'Вкажіть роботу').max(300),
            quantity: z.number().int().min(1).max(999),
            unitPriceCents: z
              .number()
              .int()
              .nonnegative()
              .max(100000000, 'Ціна за одиницю не може перевищувати 1 000 000 грн'),
            polishingCents: cents,
            subcontractCostCents: cents,
            contractorName: z.string().trim().max(120)
          })
          .strict()
      )
      .min(1, 'Додайте хоча б одну роботу')
      .max(100)
  })
  .strict()
  .superRefine((details, context) => {
    let assemblies = 0;
    for (const [index, line] of details.lines.entries()) {
      const issue = (field: string, message: string) =>
        context.addIssue({ code: 'custom', path: ['lines', index, field], message });
      const total = line.quantity * line.unitPriceCents;
      if (!Number.isSafeInteger(total))
        issue('unitPriceCents', 'Сума перевищує допустиму точність');
      if (line.kind !== 'painting' && line.polishingCents !== 0)
        issue('polishingCents', 'Полірування виділяється лише з фарбування');
      if (line.polishingCents > total)
        issue('polishingCents', 'Полірування перевищує ціну позиції');
      if (line.kind === 'painting' || line.kind === 'assembly') {
        if (line.subcontractCostCents !== 0 || line.contractorName !== '')
          issue('subcontractCostCents', 'Ця робота розраховується за ставкою працівника');
      } else {
        if (!line.contractorName) issue('contractorName', 'Вкажіть підрядника');
        if (line.kind === 'color_matching' && line.subcontractCostCents !== total)
          issue('subcontractCostCents', 'Уся сума підбору фарби належить колористу');
      }
      if (line.kind === 'assembly') assemblies++;
    }
    if (assemblies > 1)
      context.addIssue({
        code: 'custom',
        path: ['lines'],
        message: 'Розбірка-збірка вноситься однією загальною позицією'
      });
    if (new Set(details.lines.map((line) => line.id)).size !== details.lines.length)
      context.addIssue({
        code: 'custom',
        path: ['lines'],
        message: 'Ідентифікатори робіт не можуть повторюватися'
      });
    try {
      sumIntegers(details.lines.map((line) => line.quantity * line.unitPriceCents));
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['lines'],
        message: 'Загальна сума перевищує допустиму точність'
      });
    }
  });

export const saveEconomicsSchema = z
  .object({
    orgId: z.string().min(1).max(255),
    orderId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    details: economicsDetailsSchema
  })
  .strict();
export type SaveEconomicsInput = z.infer<typeof saveEconomicsSchema>;
