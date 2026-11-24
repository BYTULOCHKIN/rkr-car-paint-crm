import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWorkerSpecialties, specialtyWorkerOptions } from '../lib/team-specialties';
import { updateTeamMemberSchema } from '../schemas/team-member';
import type { TeamMember } from '../api/types';

test('membership metadata accepts known specialties only and tolerates missing or malformed values', () => {
  for (const metadata of [
    undefined,
    null,
    [],
    'painter',
    {},
    { crm: null },
    { crm: { specialties: 'painter' } }
  ])
    assert.deepEqual(readWorkerSpecialties(metadata), []);
  assert.deepEqual(
    readWorkerSpecialties({
      crm: { specialties: ['colorist', 'painter', 'painter', 'admin', 4] },
      secret: 'unused'
    }),
    ['painter', 'colorist']
  );
});

const team: TeamMember[] = [
  {
    id: 'p',
    name: 'Сергій',
    role: 'worker',
    identifier: 'p@example.com',
    specialties: ['painter', 'assembler']
  },
  {
    id: 'q',
    name: 'Валик',
    role: 'worker',
    identifier: 'q@example.com',
    specialties: ['polisher']
  },
  { id: 'a', name: 'Адміністратор', role: 'admin', identifier: 'a@example.com' }
];

test('specialty selection filters by qualification, supports multiple specialties and an explicit all-team override', () => {
  assert.deepEqual(
    specialtyWorkerOptions(team, 'painter', '', undefined, false).map((option) => option.value),
    ['p']
  );
  assert.deepEqual(
    specialtyWorkerOptions(team, 'assembler', '', undefined, false).map((option) => option.value),
    ['p']
  );
  assert.deepEqual(
    specialtyWorkerOptions(team, 'painter', '', undefined, true).map((option) => option.value),
    ['p', 'q', 'a']
  );
  assert.deepEqual(specialtyWorkerOptions(team, 'colorist', '', undefined, false), []);
});

test('existing assignments and departed workers remain visible; unconfigured teams keep working', () => {
  assert.deepEqual(
    specialtyWorkerOptions(team, 'painter', 'q', undefined, false).map((option) => option.value),
    ['p', 'q']
  );
  assert.deepEqual(
    specialtyWorkerOptions(team, 'painter', 'former', 'Колишній маляр', false).at(-1),
    { value: 'former', label: 'Колишній маляр', description: 'Більше не в команді', disabled: true }
  );
  const unconfigured = team.map(({ specialties: _specialties, ...member }) => member);
  assert.equal(specialtyWorkerOptions(unconfigured, 'painter', '', undefined, false).length, 3);
});

test('settings accept clearing specialties but reject unsupported keys, duplicates and arbitrary roles', () => {
  const input = { orgId: 'org_A', userId: 'user_p', specialties: [] };
  assert.equal(updateTeamMemberSchema.safeParse(input).success, true);
  for (const change of [
    { specialties: ['admin'] },
    { specialties: ['painter', 'painter'] },
    { role: 'org:admin' },
    { publicMetadata: { role: 'admin' } }
  ])
    assert.equal(updateTeamMemberSchema.safeParse({ ...input, ...change }).success, false);
});
