import type { RepairOrder } from '@/features/crm/api/types';
import type { OrderMaterialCosts } from '@/features/inventory/lib/order-costs';
import type { OrderEconomicsResult } from '@/features/order-economics/api/types';
import {
  EconomicsError,
  integer,
  roundedRatio,
  sumIntegers
} from '@/features/order-economics/lib/integers';
import { laborRoles, type OrderLabor } from '../api/types';

function wage(base: number, rate: number): number {
  return roundedRatio(BigInt(Math.max(0, base)) * BigInt(rate), BigInt(10000));
}

export function orderLabor(order: RepairOrder): OrderLabor {
  if (order.labor) return order.labor;
  const shareBps = order.defaultEmployeeShareBps ?? 6000;
  return {
    painter: { workerId: order.assigneeId ?? '', workerName: order.assigneeName ?? '', shareBps },
    polisher: { workerId: '', workerName: '', shareBps },
    assembler: { workerId: '', workerName: '', shareBps },
    polishingCents: 0,
    assemblyCents: 0
  };
}

export function calculateRoleSalary(
  checkCents: number,
  costs: OrderMaterialCosts,
  subcontractCents: number,
  labor: OrderLabor
): OrderEconomicsResult {
  integer(checkCents, 'Чек');
  integer(subcontractCents, 'Субпідряд');
  integer(labor.polishingCents, 'Сума полірування');
  integer(labor.assemblyCents, 'Сума розбірки-збірки');
  for (const role of laborRoles) {
    integer(labor[role].shareBps, 'Відсоток');
    if (labor[role].shareBps > 10000)
      throw new EconomicsError('Відсоток не може перевищувати 100%.');
  }
  if (Object.values(costs).some((value) => value === null))
    throw new EconomicsError(
      'Визначте собівартість списаних матеріалів перед нарахуванням зарплати.'
    );
  for (const value of Object.values(costs)) integer(value!, 'Матеріали');
  const paintingCents = sumIntegers([costs.paintingCents!, costs.unallocatedCents!]);
  const materialsCents = sumIntegers([paintingCents, costs.polishingCents!]);
  if (materialsCents !== costs.totalCents)
    throw new EconomicsError('Неузгоджена собівартість матеріалів.');
  const painterBaseCents = sumIntegers([
    checkCents,
    -paintingCents,
    -subcontractCents,
    -labor.polishingCents,
    -labor.assemblyCents
  ]);
  const polisherBaseCents = sumIntegers([labor.polishingCents, -costs.polishingCents!]);
  const assemblerBaseCents = labor.assemblyCents;
  const painterAccrualCents = wage(painterBaseCents, labor.painter.shareBps);
  const polisherAccrualCents = wage(polisherBaseCents, labor.polisher.shareBps);
  const assemblerAccrualCents = wage(assemblerBaseCents, labor.assembler.shareBps);
  const employeeAccrualsCents = sumIntegers([
    painterAccrualCents,
    polisherAccrualCents,
    assemblerAccrualCents
  ]);
  return {
    checkCents,
    materialsCents,
    painterBaseCents,
    polisherBaseCents,
    assemblerBaseCents,
    painterAccrualCents,
    polisherAccrualCents,
    assemblerAccrualCents,
    employeeAccrualsCents,
    subcontractCostsCents: subcontractCents,
    workshopRemainderCents: sumIntegers([
      checkCents,
      -materialsCents,
      -subcontractCents,
      -employeeAccrualsCents
    ])
  };
}
