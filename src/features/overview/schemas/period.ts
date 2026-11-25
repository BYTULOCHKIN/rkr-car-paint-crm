import { z } from 'zod';

export const overviewPeriodSchema = z
  .object({
    from: z.iso.date('Вкажіть коректну початкову дату'),
    to: z.iso.date('Вкажіть коректну кінцеву дату')
  })
  .strict()
  .refine((value) => value.from <= value.to, {
    path: ['to'],
    message: 'Кінець періоду не може бути раніше початку'
  });
export type OverviewPeriod = z.infer<typeof overviewPeriodSchema>;
export const overviewOrderMetrics = [
  'created_period',
  'completed',
  'receipts',
  'ready_debt',
  'open_debt',
  'profit',
  'unposted'
] as const;
export type OverviewOrderMetric = (typeof overviewOrderMetrics)[number];
