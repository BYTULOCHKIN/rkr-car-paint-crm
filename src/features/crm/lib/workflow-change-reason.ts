import type { WorkflowRecord } from '../api/types';
import type { WorkflowInput } from '../schemas/crm';

/** Mirrors the repository's reason requirements using the draft's original record. */
export function workflowChangeReason(target: WorkflowRecord, value: WorkflowInput): string | null {
  if (
    (['plannedIntakeDate', 'plannedDeliveryDate'] as const).some((key) => {
      return target.record[key] && target.record[key] !== (value[key] || null);
    })
  )
    return 'Вкажіть причину перенесення запланованих дат';
  if (
    target.kind === 'order' &&
    (['actualIntakeDate', 'actualReadyDate', 'actualDeliveryDate'] as const).some(
      (key) => target.record[key] && target.record[key] !== value[key]
    )
  )
    return 'Вкажіть причину зміни фактичної дати або повернення статусу';
  return null;
}
