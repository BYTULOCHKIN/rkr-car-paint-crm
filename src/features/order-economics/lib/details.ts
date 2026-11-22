import type { OrderEconomicsDetails, OrderEconomicsResult } from '../api/types';
import type { OrderMaterialCosts } from '@/features/inventory/lib/order-costs';
import type { OrderItem } from '@/features/crm/api/types';
import { calculateOrderEconomics } from './calculate';
import { sumIntegers } from './integers';

export const workKindOptions = [
  { value: 'painting', label: 'Фарбування деталі' },
  { value: 'assembly', label: 'Розбірка-збірка' },
  { value: 'color_matching', label: 'Підбір фарби' },
  { value: 'soldering', label: 'Пайка' },
  { value: 'other', label: 'Інший субпідряд' }
];

export function detailedCheckItems(details: OrderEconomicsDetails): OrderItem[] {
  return details.lines.map((line) => ({
    description: line.description,
    quantity: line.quantity,
    unitPriceCents: line.unitPriceCents
  }));
}

export interface DetailedEconomicsPreview {
  result: OrderEconomicsResult | null;
  issues: string[];
}

export function previewDetailedEconomics(
  details: OrderEconomicsDetails,
  costs: OrderMaterialCosts
): DetailedEconomicsPreview {
  const issues: string[] = [];
  if (costs.totalCents === null || costs.paintingCents === null || costs.polishingCents === null)
    issues.push('Собівартість частини матеріалів не визначена.');
  if (costs.unallocatedCents === null || costs.unallocatedCents > 0)
    issues.push('Частина матеріалів не віднесена до виду робіт.');
  const painting = details.lines.filter((line) => line.kind === 'painting');
  const assembly = details.lines.filter((line) => line.kind === 'assembly');
  const sum = (lines: typeof details.lines) =>
    sumIntegers(lines.map((line) => line.quantity * line.unitPriceCents));
  const paintingPriceCents = sum(painting);
  const polishingPriceCents = sumIntegers(painting.map((line) => line.polishingCents));
  const assemblyPriceCents = sum(assembly);
  if (paintingPriceCents > polishingPriceCents && !details.painterId)
    issues.push('Не призначено маляра.');
  if (polishingPriceCents > 0 && !details.polisherId) issues.push('Не призначено полірувальника.');
  if (assemblyPriceCents > 0 && !details.assemblerId) issues.push('Не призначено розбірника.');
  if (
    costs.totalCents === null ||
    costs.paintingCents === null ||
    costs.polishingCents === null ||
    costs.unallocatedCents === null ||
    costs.unallocatedCents > 0
  )
    return { result: null, issues };
  try {
    return {
      issues,
      result: calculateOrderEconomics({
        paintingPriceCents,
        polishingPriceCents,
        assemblyPriceCents,
        paintingMaterialsCents: costs.paintingCents,
        polishingMaterialsCents: costs.polishingCents,
        employeeShareBps: details.employeeShareBps,
        subcontracts: details.lines.flatMap((line) =>
          line.kind === 'painting' || line.kind === 'assembly'
            ? []
            : [
                {
                  kind: line.kind,
                  priceCents: line.quantity * line.unitPriceCents,
                  costCents: line.subcontractCostCents
                }
              ]
        )
      })
    };
  } catch (error) {
    return {
      result: null,
      issues: [...issues, error instanceof Error ? error.message : 'Перевірте розрахунок']
    };
  }
}
