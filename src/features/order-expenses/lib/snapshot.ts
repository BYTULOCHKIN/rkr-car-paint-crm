import type { RepairOrder } from '@/features/crm/api/types';
import type { OrderMaterialCosts } from '@/features/inventory/lib/order-costs';
import type { EconomicsPosting } from '@/features/order-economics/api/types';
import { EconomicsError, sumIntegers } from '@/features/order-economics/lib/integers';
import { aggregateAccruals } from '@/features/order-economics/lib/settlements';
import { calculateNetOrder } from './calculate';

/** Legacy role field names remain only in persisted snapshots; the payee is the order responsible. */
export function netSalarySnapshot(
  order: RepairOrder,
  costs: OrderMaterialCosts
): Pick<EconomicsPosting, 'model' | 'expenses' | 'details' | 'costs' | 'result' | 'allocations'> {
  if (!order.assigneeId)
    throw new EconomicsError('Вкажіть відповідального перед завершенням авто.');
  const expenses = order.expenses ?? [];
  const net = calculateNetOrder(
    order.totalCents,
    costs.totalCents,
    sumIntegers(expenses.map((expense) => expense.amountCents)),
    order.defaultEmployeeShareBps ?? 6000
  );
  const allocations = aggregateAccruals([
    {
      payee: {
        kind: 'worker' as const,
        id: order.assigneeId,
        name: order.assigneeName || 'Працівник'
      },
      amountCents: net.employeeCents
    },
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
    model: 'order_net' as const,
    expenses,
    details: {
      employeeShareBps: net.employeeShareBps,
      painterId: order.assigneeId,
      painterName: order.assigneeName || 'Працівник',
      polisherId: '',
      assemblerId: '',
      lines: []
    },
    costs: costs as EconomicsPosting['costs'],
    result: {
      checkCents: net.checkCents,
      materialsCents: net.materialsCents,
      painterBaseCents: net.baseCents,
      polisherBaseCents: 0,
      assemblerBaseCents: 0,
      painterAccrualCents: net.employeeCents,
      polisherAccrualCents: 0,
      assemblerAccrualCents: 0,
      employeeAccrualsCents: net.employeeCents,
      subcontractCostsCents: net.subcontractCents,
      workshopRemainderCents: net.workshopCents
    },
    allocations
  };
}
