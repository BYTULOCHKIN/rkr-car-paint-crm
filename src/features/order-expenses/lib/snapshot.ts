import type { RepairOrder } from '@/features/crm/api/types';
import type { OrderMaterialCosts } from '@/features/inventory/lib/order-costs';
import type { EconomicsPosting } from '@/features/order-economics/api/types';
import { EconomicsError, sumIntegers } from '@/features/order-economics/lib/integers';
import { aggregateAccruals } from '@/features/order-economics/lib/settlements';
import { calculateRoleSalary, orderLabor } from '@/features/order-labor/lib/calculate';
import { laborRoles } from '@/features/order-labor/api/types';

/** Immutable role snapshots keep historical wages independent of later order settings. */
export function netSalarySnapshot(
  order: RepairOrder,
  costs: OrderMaterialCosts
): Pick<EconomicsPosting, 'model' | 'expenses' | 'details' | 'costs' | 'result' | 'allocations'> {
  const labor = orderLabor(order);
  if (!labor.painter.workerId) throw new EconomicsError('Вкажіть маляра перед завершенням авто.');
  if (labor.polishingCents > 0 && !labor.polisher.workerId)
    throw new EconomicsError('Вкажіть полірувальника.');
  if (labor.assemblyCents > 0 && !labor.assembler.workerId)
    throw new EconomicsError('Вкажіть розбірника-збірника.');
  const expenses = order.expenses ?? [];
  const result = calculateRoleSalary(
    order.totalCents,
    costs,
    sumIntegers(expenses.map((expense) => expense.amountCents)),
    labor
  );
  const allocations = aggregateAccruals([
    ...laborRoles
      .filter((role) => labor[role].workerId)
      .map((role) => ({
        payee: {
          kind: 'worker' as const,
          id: labor[role].workerId,
          name: labor[role].workerName || 'Працівник'
        },
        amountCents: result[`${role}AccrualCents`]
      })),
    ...expenses.map((expense) => ({
      payee: {
        kind: 'contractor' as const,
        id: expense.contractorId,
        name: expense.contractorName
      },
      amountCents: expense.amountCents
    }))
  ]);
  return {
    model: 'order_roles' as const,
    expenses,
    details: {
      employeeShareBps: labor.painter.shareBps,
      roleSharesBps: {
        painter: labor.painter.shareBps,
        polisher: labor.polisher.shareBps,
        assembler: labor.assembler.shareBps
      },
      painterId: labor.painter.workerId,
      painterName: labor.painter.workerName || 'Працівник',
      polisherId: labor.polisher.workerId,
      polisherName: labor.polisher.workerName,
      assemblerId: labor.assembler.workerId,
      assemblerName: labor.assembler.workerName,
      lines: []
    },
    costs: costs as EconomicsPosting['costs'],
    result,
    allocations
  };
}
