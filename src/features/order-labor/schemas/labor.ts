import { z } from 'zod';

const assignment = z
  .object({
    workerId: z.string().max(255),
    workerName: z.string().max(255),
    shareBps: z.number().int().min(0).max(10000, 'Відсоток не може перевищувати 100%')
  })
  .strict();
export const orderLaborSchema = z
  .object({
    painter: assignment,
    polisher: assignment,
    assembler: assignment,
    polishingCents: z.number().int().min(0).max(999999999999),
    assemblyCents: z.number().int().min(0).max(999999999999)
  })
  .strict()
  .superRefine((labor, context) => {
    if (!labor.painter.workerId)
      context.addIssue({
        code: 'custom',
        path: ['painter', 'workerId'],
        message: 'Виберіть маляра'
      });
    if (labor.polishingCents > 0 && !labor.polisher.workerId)
      context.addIssue({
        code: 'custom',
        path: ['polisher', 'workerId'],
        message: 'Виберіть полірувальника'
      });
    if (labor.assemblyCents > 0 && !labor.assembler.workerId)
      context.addIssue({
        code: 'custom',
        path: ['assembler', 'workerId'],
        message: 'Виберіть розбірника-збірника'
      });
  });
export const saveOrderLaborSchema = z
  .object({
    orgId: z.string().min(1).max(255),
    orderId: z.uuid(),
    operationId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    labor: orderLaborSchema
  })
  .strict();
export type SaveOrderLaborInput = z.infer<typeof saveOrderLaborSchema>;

const decimal = z
  .string()
  .trim()
  .regex(/^\d{1,10}([.,]\d{1,2})?$/, 'Вкажіть суму, до 2 знаків після коми');
const share = z
  .string()
  .trim()
  .regex(/^\d{1,3}([.,]\d{1,2})?$/, 'Вкажіть відсоток від 0 до 100')
  .refine((value) => Number(value.replace(',', '.')) <= 100, 'Відсоток не може перевищувати 100%');
const formAssignment = z.object({ workerId: z.string(), workerName: z.string(), share: share });
export const laborFormSchema = z
  .object({
    painter: formAssignment,
    polisher: formAssignment,
    assembler: formAssignment,
    polishing: decimal,
    assembly: decimal,
    expectedRevision: z.number().int().nonnegative()
  })
  .superRefine((value, context) => {
    for (const [role, required, label] of [
      ['painter', true, 'маляра'],
      ['polisher', Number(value.polishing.replace(',', '.')) > 0, 'полірувальника'],
      ['assembler', Number(value.assembly.replace(',', '.')) > 0, 'розбірника-збірника']
    ] as const) {
      if (required && !value[role].workerId)
        context.addIssue({
          code: 'custom',
          path: [role, 'workerId'],
          message: `Виберіть ${label}`
        });
    }
  });
