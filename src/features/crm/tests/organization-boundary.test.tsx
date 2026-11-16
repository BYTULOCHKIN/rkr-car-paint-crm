import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '@clerk/nextjs';
import { OrganizationBoundary } from '../components/organization-boundary';
vi.mock('@clerk/nextjs', () => ({ useAuth: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
test('organization switch hides previous shop immediately and clears the old query cache', () => {
  const client = new QueryClient();
  client.setQueryData(['crm', 'org_A'], 'old-private-data');
  vi.mocked(useAuth).mockReturnValue({ isLoaded: true, orgId: 'org_A' } as ReturnType<
    typeof useAuth
  >);
  const tree = (orgId: string) => (
    <QueryClientProvider client={client}>
      <OrganizationBoundary orgId={orgId}>
        <p>Дані {orgId}</p>
      </OrganizationBoundary>
    </QueryClientProvider>
  );
  const { rerender } = render(tree('org_A'));
  expect(screen.getByText('Дані org_A')).toBeDefined();
  vi.mocked(useAuth).mockReturnValue({ isLoaded: true, orgId: 'org_B' } as ReturnType<
    typeof useAuth
  >);
  rerender(tree('org_A'));
  expect(screen.queryByText('Дані org_A')).toBeNull();
  expect(screen.getByRole('status').textContent).toContain('Завантажуємо');
  expect(client.getQueryData(['crm', 'org_A'])).toBeUndefined();
  rerender(tree('org_B'));
  expect(screen.getByText('Дані org_B')).toBeDefined();
});
