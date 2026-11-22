import { z } from 'zod';
import type { ReportFilters } from '../api/types';

export const reportFiltersSchema = z
  .object({
    from: z.iso.date('Вкажіть коректну початкову дату'),
    to: z.iso.date('Вкажіть коректну кінцеву дату'),
    orderDate: z.enum(['ready', 'created', 'delivered'])
  })
  .strict()
  .refine((value) => value.from <= value.to, {
    message: 'Кінець періоду не може бути раніше початку',
    path: ['to']
  });

export function defaultReportFilters(today: string): ReportFilters {
  return { from: `${today.slice(0, 7)}-01`, to: today, orderDate: 'ready' };
}

export const orderDateOptions = [
  { value: 'ready', label: 'За датою готовності' },
  { value: 'created', label: 'За датою створення' },
  { value: 'delivered', label: 'За датою видачі' }
];
