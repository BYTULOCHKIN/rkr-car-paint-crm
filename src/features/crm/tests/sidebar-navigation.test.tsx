import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppSidebar from '@/components/layout/app-sidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';

const navigation = vi.hoisted(() => ({
  pathname: '/dashboard/orders',
  mobile: true,
  role: 'org:admin'
}));
vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn() })
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => navigation.mobile }));
vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: null }),
  useOrganization: () => ({
    organization: { id: 'org_test' },
    membership: { role: navigation.role, permissions: [] }
  }),
  useClerk: () => ({ signOut: vi.fn() })
}));
vi.mock('@/components/org-switcher', () => ({ OrgSwitcher: () => null }));

function PersistentLayout() {
  return (
    <SidebarProvider defaultOpen>
      <SidebarTrigger />
      <AppSidebar />
    </SidebarProvider>
  );
}

beforeEach(() => {
  navigation.pathname = '/dashboard/orders';
  navigation.mobile = true;
  navigation.role = 'org:admin';
});

test('mobile sheet closes after a route change while the layout stays mounted and can reopen', async () => {
  const user = userEvent.setup();
  const view = render(<PersistentLayout />);
  await user.click(screen.getAllByRole('button', { name: 'Toggle Sidebar' })[0]);
  await screen.findByRole('dialog', { name: 'Sidebar' });
  await user.click(screen.getByRole('button', { name: 'Клієнти та автомобілі' }));
  expect(screen.getByRole('link', { name: 'Клієнти' })).toBeDefined();
  expect(screen.getByRole('dialog', { name: 'Sidebar' })).toBeDefined();
  navigation.pathname = '/dashboard/clients';
  view.rerender(<PersistentLayout />);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sidebar' })).toBeNull());
  await user.click(screen.getAllByRole('button', { name: 'Toggle Sidebar' })[0]);
  await screen.findByRole('dialog', { name: 'Sidebar' });
  navigation.pathname = '/dashboard/kanban';
  view.rerender(<PersistentLayout />);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sidebar' })).toBeNull());
});

test('disabled mobile navigation keeps the menu open', async () => {
  navigation.role = 'org:member';
  const user = userEvent.setup();
  render(<PersistentLayout />);
  await user.click(screen.getAllByRole('button', { name: 'Toggle Sidebar' })[0]);
  await screen.findByRole('dialog', { name: 'Sidebar' });
  const overview = screen.getByRole('button', { name: 'Огляд' }) as HTMLButtonElement;
  expect(overview.disabled).toBe(true);
  await user.click(overview);
  expect(screen.getByRole('dialog', { name: 'Sidebar' })).toBeDefined();
  expect(navigation.pathname).toBe('/dashboard/orders');
});

test('desktop expanded and collapsed state is preserved across route changes', async () => {
  navigation.mobile = false;
  const user = userEvent.setup();
  const view = render(<PersistentLayout />);
  const state = () =>
    view.container.querySelector('[data-slot=sidebar][data-state]')?.getAttribute('data-state');
  expect(state()).toBe('expanded');
  navigation.pathname = '/dashboard/clients';
  view.rerender(<PersistentLayout />);
  expect(state()).toBe('expanded');
  await user.click(screen.getAllByRole('button', { name: 'Toggle Sidebar' })[0]);
  expect(state()).toBe('collapsed');
  navigation.pathname = '/dashboard/kanban';
  view.rerender(<PersistentLayout />);
  expect(state()).toBe('collapsed');
});
