import type { RepairOrder, TeamMember } from '../api/types';
export function assigneeLabel(order: RepairOrder, team?: TeamMember[]): string {
  if (!order.assigneeId) return 'Не призначено';
  return (
    team?.find((member) => member.id === order.assigneeId)?.name ||
    order.assigneeName ||
    'Учасник команди'
  );
}
