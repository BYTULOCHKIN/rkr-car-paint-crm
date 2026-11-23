import { beforeEach, expect, test, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamView } from '../components/team-view';
import { crmQueries } from '../api/queries';
import type { CrmRole, TeamMember } from '../api/types';
import { getTeam, updateTeamMember } from '../api/service';
vi.mock('@clerk/nextjs', () => ({ OrganizationProfile: () => <p>Clerk team management</p> }));
vi.mock('../api/service', () => ({ getTeam: vi.fn(), updateTeamMember: vi.fn() }));
beforeEach(() => vi.clearAllMocks());
function team(role: CrmRole) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } }
  });
  const data = {
    access: { userId: 'user_me', orgId: 'org_A', role },
    team: [
      { id: 'user_me', name: 'Олена', identifier: 'owner@example.com', role: 'admin' },
      { id: 'user_worker', name: 'Андрій', identifier: 'worker@example.com', role: 'worker' }
    ] as TeamMember[]
  };
  vi.mocked(getTeam).mockResolvedValue(data);
  vi.mocked(updateTeamMember).mockImplementation(async (input) => {
    data.team.find((member) => member.id === input.userId)!.specialties = input.specialties;
    return { ok: true, data: input.specialties };
  });
  client.setQueryData(crmQueries.team('user_me', 'org_A').queryKey, data);
  const view = render(
    <QueryClientProvider client={client}>
      <TeamView userId='user_me' orgId='org_A' />
    </QueryClientProvider>
  );
  return { ...view, client, data };
}
test('admin sees active members, human-readable roles and built-in team management', () => {
  team('admin');
  expect(screen.getByText('Олена')).toBeDefined();
  expect(screen.getByText('Андрій')).toBeDefined();
  expect(screen.getByText('Адміністратор')).toBeDefined();
  expect(screen.getByText('Виконавець')).toBeDefined();
  expect(screen.getByText('Clerk team management')).toBeDefined();
});

test('admin edits several specialties in a member dialog and refreshed team shows the saved values', async () => {
  team('admin');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Налаштувати учасника Андрій' }));
  const dialog = screen.getByRole('dialog', { name: 'Учасник команди — Андрій' });
  await user.click(within(dialog).getByRole('checkbox', { name: 'Маляр' }));
  await user.click(within(dialog).getByRole('checkbox', { name: 'Полірувальник' }));
  await user.click(within(dialog).getByRole('button', { name: 'Зберегти налаштування' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(updateTeamMember).toHaveBeenCalledWith({
    orgId: 'org_A',
    userId: 'user_worker',
    specialties: ['painter', 'polisher']
  });
  expect(screen.getByText('Маляр', { exact: true })).toBeDefined();
  expect(screen.getByText('Полірувальник', { exact: true })).toBeDefined();
  await user.click(screen.getByRole('button', { name: 'Налаштувати учасника Андрій' }));
  expect(screen.getByRole('checkbox', { name: 'Маляр' }).getAttribute('aria-checked')).toBe('true');
});

test('closing a dirty member dialog asks to discard changes and does not save them', async () => {
  team('admin');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Налаштувати учасника Андрій' }));
  await user.click(screen.getByRole('checkbox', { name: 'Маляр' }));
  await user.click(screen.getByRole('button', { name: 'Скасувати' }));
  expect(screen.getByRole('alertdialog', { name: 'Відкинути зміни?' })).toBeDefined();
  await user.click(screen.getByRole('button', { name: 'Відкинути зміни' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(updateTeamMember).not.toHaveBeenCalled();
});

test('failed saves preserve the draft and revoked administrator access blocks further editing', async () => {
  const view = team('admin');
  vi.mocked(updateTeamMember).mockResolvedValueOnce({ ok: false, error: 'Повторіть спробу' });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Налаштувати учасника Андрій' }));
  await user.click(screen.getByRole('checkbox', { name: 'Маляр' }));
  await user.click(screen.getByRole('button', { name: 'Зберегти налаштування' }));
  expect(await screen.findByText('Повторіть спробу')).toBeDefined();
  expect(screen.getByRole('checkbox', { name: 'Маляр' }).getAttribute('aria-checked')).toBe('true');
  const updatedData = { ...view.data, access: { ...view.data.access, role: 'worker' as const } };
  vi.mocked(getTeam).mockResolvedValue(updatedData);
  await act(async () =>
    view.client.setQueryData(crmQueries.team('user_me', 'org_A').queryKey, updatedData)
  );
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Зберегти налаштування' })).toBeNull()
  );
  expect(screen.getByRole('checkbox', { name: 'Маляр' }).getAttribute('aria-disabled')).toBe(
    'true'
  );
});
test('worker sees the team without administrative invitation controls', () => {
  team('worker');
  expect(screen.getByText('Андрій')).toBeDefined();
  expect(screen.queryByText('Clerk team management')).toBeNull();
  expect(
    screen.getByText('Запрошувати учасників і змінювати ролі може адміністратор.')
  ).toBeDefined();
});
