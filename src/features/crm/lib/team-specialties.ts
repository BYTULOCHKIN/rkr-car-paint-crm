import type { TeamMember, WorkerSpecialty } from '../api/types';
import type { ChoiceOption } from '@/components/forms/fields/choice-options';

export const workerSpecialtyOptions: { value: WorkerSpecialty; label: string }[] = [
  { value: 'painter', label: 'Маляр' },
  { value: 'polisher', label: 'Полірувальник' },
  { value: 'assembler', label: 'Розбірник-збірник' },
  { value: 'colorist', label: 'Колорист' }
];

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Only explicitly supported CRM fields cross the server/client boundary. */
export function readWorkerSpecialties(metadata: unknown): WorkerSpecialty[] {
  const values = record(record(metadata)?.crm)?.specialties;
  if (!Array.isArray(values)) return [];
  return workerSpecialtyOptions.flatMap(({ value }) => (values.includes(value) ? [value] : []));
}

export function specialtyLabels(specialties: readonly WorkerSpecialty[] = []): string {
  return workerSpecialtyOptions
    .filter(({ value }) => specialties.includes(value))
    .map(({ label }) => label)
    .join(', ');
}

export function teamMemberChoices(
  team: TeamMember[],
  selectedId?: string,
  historicalName?: string
): ChoiceOption[] {
  return [
    ...team.map((member) => ({
      value: member.id,
      label: member.name,
      description: specialtyLabels(member.specialties) || 'Спеціалізацію не вказано',
      keywords: [member.role === 'admin' ? 'Адміністратор' : 'Виконавець']
    })),
    ...(selectedId && !team.some((member) => member.id === selectedId)
      ? [
          {
            value: selectedId,
            label: historicalName || 'Колишній учасник',
            description: 'Більше не в команді',
            disabled: true
          }
        ]
      : [])
  ];
}

export function specialtyWorkerOptions(
  team: TeamMember[],
  specialty: WorkerSpecialty,
  selectedId: string,
  historicalName: string | undefined,
  showAll: boolean
): ChoiceOption[] {
  const configured = team.some((member) => member.specialties?.length);
  const available = team.filter(
    (member) =>
      showAll || !configured || member.specialties?.includes(specialty) || member.id === selectedId
  );
  return teamMemberChoices(available, selectedId, historicalName);
}

export function readSubcontractPayroll(metadata: unknown): boolean {
  return record(record(metadata)?.crm)?.includeSubcontractInPayroll === true;
}
