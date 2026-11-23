import { encodeCsv } from '@/features/workshop-reports/lib/csv';
import { specialtyLabels, workerSpecialtyOptions } from '@/features/crm/lib/team-specialties';
import type { PayrollFilters, PayrollWorker } from '../api/types';

function amount(cents: number): { numeric: string } {
  const magnitude = BigInt(Math.abs(cents));
  return {
    numeric: `${cents < 0 ? '-' : ''}${magnitude / BigInt(100)},${String(magnitude % BigInt(100)).padStart(2, '0')}`
  };
}

export function payrollCsv(
  workers: PayrollWorker[],
  filters: PayrollFilters,
  detailed = false
): string {
  const rows: Parameters<typeof encodeCsv>[0] = [['Період включно', filters.from, filters.to]];
  if (!detailed)
    return encodeCsv([
      ...rows,
      ['Працівник', 'Спеціалізації', 'Авто', 'Нараховано, грн', 'Коригування, грн', 'Разом, грн'],
      ...workers.map((worker) => [
        worker.name,
        specialtyLabels(worker.specialties),
        worker.orderCount,
        amount(worker.accrualCents),
        amount(worker.adjustmentCents),
        amount(worker.totalCents)
      ])
    ]);
  rows.push([
    'Працівник',
    'Дата проведення',
    'Замовлення',
    'Автомобіль',
    'Вид роботи',
    'Операція',
    'База до, грн',
    'Ставка до, %',
    'База після, грн',
    'Ставка після, %',
    'Нарахування за операцією, грн',
    'Примітка'
  ]);
  for (const worker of workers)
    for (const entry of worker.entries)
      rows.push([
        worker.name,
        entry.createdAt,
        entry.order.number,
        entry.order.vehicle,
        entry.role === 'responsible'
          ? 'Відповідальний'
          : workerSpecialtyOptions.find((option) => option.value === entry.role)!.label,
        entry.kind === 'initial' ? 'Нарахування' : 'Коригування',
        entry.before ? amount(entry.before.baseCents) : '',
        entry.before ? amount(entry.before.shareBps) : '',
        entry.after ? amount(entry.after.baseCents) : '',
        entry.after ? amount(entry.after.shareBps) : '',
        amount(entry.amountCents),
        entry.note
      ]);
  return encodeCsv(rows);
}
