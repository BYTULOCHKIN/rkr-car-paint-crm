import { z } from 'zod';
import type { PayrollFilters } from '../api/types';

export const payrollFiltersSchema = z
  .object({
    from: z.iso.date('Вкажіть коректну початкову дату'),
    to: z.iso.date('Вкажіть коректну кінцеву дату')
  })
  .strict()
  .refine((value) => value.from <= value.to, {
    message: 'Кінець періоду не може бути раніше початку',
    path: ['to']
  });

export function defaultPayrollFilters(today: string): PayrollFilters {
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export function previousPayrollMonth(today: string): PayrollFilters {
  const [year, month] = today.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
  return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
}
