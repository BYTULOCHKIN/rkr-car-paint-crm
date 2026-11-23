import {
  EconomicsError,
  integer,
  roundedRatio,
  sumIntegers
} from '@/features/order-economics/lib/integers';
import type { NetOrderResult } from '../api/types';

export function calculateNetOrder(
  checkCents: number,
  materialsCents: number | null,
  subcontractCents: number,
  employeeShareBps: number
): NetOrderResult {
  integer(checkCents, 'Сума замовлення');
  if (materialsCents === null)
    throw new EconomicsError(
      'Визначте собівартість списаних матеріалів перед нарахуванням зарплати.'
    );
  integer(materialsCents, 'Матеріали');
  integer(subcontractCents, 'Субпідряд');
  integer(employeeShareBps, 'Частка відповідального');
  if (employeeShareBps > 10000)
    throw new EconomicsError('Частка відповідального не може перевищувати 100%.');
  const baseCents = sumIntegers([checkCents, -materialsCents, -subcontractCents]);
  const employeeCents = roundedRatio(
    BigInt(Math.max(0, baseCents)) * BigInt(employeeShareBps),
    BigInt(10000)
  );
  return {
    checkCents,
    materialsCents,
    subcontractCents,
    baseCents,
    employeeShareBps,
    employeeCents,
    workshopCents: baseCents - employeeCents
  };
}
