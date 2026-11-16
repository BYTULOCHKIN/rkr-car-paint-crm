import type { RepairOrder, ActionResult } from '../api/types';
import { workflowSchema, type WorkflowInput, type AdvanceOrderInput } from '../schemas/crm';
import { businessToday } from './workflow';

export function executorTransition(
  order: RepairOrder,
  expected: AdvanceOrderInput,
  today = businessToday()
): ActionResult<WorkflowInput> {
  if (
    order.id !== expected.id ||
    order.status !== expected.expectedStatus ||
    (order.workflowRevision ?? 0) !== expected.expectedRevision
  )
    return { ok: false, error: 'Замовлення вже змінено. Відкрийте його повторно.' };
  if (order.status === 'delivered') return { ok: false, error: 'Замовлення вже видано.' };
  if (!order.actualIntakeDate || (order.status === 'ready' && !order.actualReadyDate))
    return { ok: false, error: 'Спочатку адміністратор має уточнити попередні фактичні дати.' };
  if (order.status === 'in_progress' && order.actualDeliveryDate)
    return { ok: false, error: 'Адміністратор має виправити фактичні дати цього замовлення.' };
  const value = workflowSchema.safeParse({
    kind: 'order',
    id: order.id,
    expectedStatus: order.status,
    expectedRevision: expected.expectedRevision,
    status: order.status === 'in_progress' ? 'ready' : 'delivered',
    plannedIntakeDate: order.plannedIntakeDate ?? '',
    plannedDeliveryDate: order.plannedDeliveryDate ?? '',
    actualIntakeDate: order.actualIntakeDate,
    actualReadyDate: order.actualReadyDate || today,
    actualDeliveryDate: order.status === 'ready' ? order.actualDeliveryDate || today : '',
    note: ''
  });
  return value.success
    ? { ok: true, data: value.data }
    : { ok: false, error: 'Адміністратор має перевірити хронологію фактичних дат.' };
}
