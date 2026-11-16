import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamView } from '../components/team-view';
import { crmQueries } from '../api/queries';
import type { CrmRole } from '../api/types';
vi.mock('@clerk/nextjs', () => ({ OrganizationProfile: () => <p>Clerk team management</p> }));
vi.mock('../api/service', () => ({ getTeam: vi.fn() }));
function team(role: CrmRole) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } }
  });
  client.setQueryData(crmQueries.team('user_me', 'org_A').queryKey, {
    access: { userId: 'user_me', orgId: 'org_A', role },
    team: [
      { id: 'user_me', name: 'Олена', identifier: 'owner@example.com', role: 'admin' },
      { id: 'user_worker', name: 'Андрій', identifier: 'worker@example.com', role: 'worker' }
    ]
  });
  return render(
    <QueryClientProvider client={client}>
      <TeamView userId='user_me' orgId='org_A' />
    </QueryClientProvider>
  );
}
test('admin sees active members, human-readable roles and built-in team management', () => {
  team('admin');
  expect(screen.getByText('Олена')).toBeDefined();
  expect(screen.getByText('Андрій')).toBeDefined();
  expect(screen.getByText('Адміністратор')).toBeDefined();
  expect(screen.getByText('Виконавець')).toBeDefined();
  expect(screen.getByText('Clerk team management')).toBeDefined();
});
test('worker sees the team without administrative invitation controls', () => {
  team('worker');
  expect(screen.getByText('Андрій')).toBeDefined();
  expect(screen.queryByText('Clerk team management')).toBeNull();
  expect(
    screen.getByText('Запрошувати учасників і змінювати ролі може адміністратор.')
  ).toBeDefined();
});
