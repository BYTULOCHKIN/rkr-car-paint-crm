import type { TeamMember } from '@/features/crm/api/types';
import { reportFixture } from '@/features/workshop-reports/tests/fixtures';

export function payrollFixture() {
  const source = reportFixture();
  const team: TeamMember[] = [
    {
      id: 'p',
      name: 'Сергій',
      identifier: 'serhii@example.com',
      role: 'worker',
      specialties: ['painter', 'assembler']
    },
    {
      id: 'q',
      name: 'Валик',
      identifier: 'valyk@example.com',
      role: 'worker',
      specialties: ['polisher']
    },
    { id: 'zero', name: 'Артем', identifier: 'artem@example.com', role: 'worker', specialties: [] }
  ];
  return { ...source, team };
}
