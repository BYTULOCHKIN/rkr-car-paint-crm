import { TeamView } from '@/features/crm/components/team-view';
import { PayrollView } from '@/features/payroll/components/payroll-view';
import { lazy, Profiler, Suspense } from 'react';
const UsersTable = lazy(() =>
  import('@/features/users/components/users-table').then((module) => ({
    default: module.UsersTable
  }))
);
import { InventoryView } from '@/features/inventory/components/inventory-view';
import { ReportView } from '@/features/workshop-reports/components/report-view';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/react';
import PageContainer from '@/components/layout/page-container';
import { CrmWorkspaceView } from '@/features/crm/components/workspace';
import { VehiclesView } from '@/features/crm/components/vehicles-view';
import { CrmKanbanBoard } from '@/features/crm/components/kanban-board';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import Overview from '@/features/overview/components/overview';
import { OverviewHeaderActions } from '@/features/overview/components/overview-header-actions';
import { businessToday } from '@/features/crm/lib/workflow';
import { Sidebar, SidebarContent, SidebarHeader, SidebarProvider } from '@/components/ui/sidebar';
import { DashboardInset } from '@/components/layout/dashboard-inset';
import Header from '@/components/layout/header';
import AppSidebar from '@/components/layout/app-sidebar';
import { ActiveThemeProvider } from '@/components/themes/active-theme';
import ThemeProvider from '@/components/themes/theme-provider';
import { DEFAULT_THEME, THEMES } from '@/components/themes/theme.config';
import { KBarProvider } from 'kbar';

function ProfiledBoard() {
  return (
    <Profiler
      id='board'
      onRender={(_id, phase, duration) => {
        if (!new URLSearchParams(location.search).has('largeBoard')) return;
        const target = window as unknown as {
          boardProfile?: { phase: string; duration: number }[];
        };
        (target.boardProfile ??= []).push({ phase, duration });
      }}
    >
      <CrmKanbanBoard userId='browser-test' />
    </Profiler>
  );
}

const route = location.pathname.split('/').pop() ?? 'clients';
const titles: Record<string, string> = {
  users: 'Користувачі',
  inventory: 'Склад',
  reports: 'Зведення за період',
  payroll: 'Зарплати',
  team: 'Команда',
  overview: 'Огляд автомалярки',
  kanban: 'Дошка робіт',
  clients: 'Клієнти',
  orders: 'Замовлення',
  requests: 'Заявки',
  vehicles: 'Автомобілі'
};
if (new URLSearchParams(location.search).has('dark'))
  document.documentElement.classList.add('dark');
const settingsDemo = new URLSearchParams(location.search).has('settingsDemo');
const savedTheme = document.cookie
  .split('; ')
  .find((cookie) => cookie.startsWith('active_theme='))
  ?.slice('active_theme='.length);
const initialTheme =
  settingsDemo && THEMES.some((theme) => theme.value === savedTheme) ? savedTheme : DEFAULT_THEME;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function FixturePage({ children }: { children: React.ReactNode }) {
  return ['clients', 'orders'].includes(route) ? (
    <>{children}</>
  ) : (
    <PageContainer
      pageTitle={titles[route]}
      pageDescription='Керування роботою автомалярки'
      pageHeaderLayout={route === 'overview' ? 'responsive' : 'inline'}
      pageHeaderAction={
        route === 'overview' ? <OverviewHeaderActions initialToday={businessToday()} /> : undefined
      }
    >
      {children}
    </PageContainer>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <NuqsAdapter>
      <TooltipProvider>
        <KBarProvider actions={[]}>
          <ThemeProvider
            attribute='class'
            forcedTheme={
              settingsDemo
                ? undefined
                : new URLSearchParams(location.search).has('dark')
                  ? 'dark'
                  : 'light'
            }
            defaultTheme='system'
            enableSystem
            disableTransitionOnChange
          >
            <ActiveThemeProvider initialTheme={initialTheme}>
              <SidebarProvider
                defaultOpen={new URLSearchParams(location.search).get('sidebar') !== 'closed'}
              >
                {new URLSearchParams(location.search).has('realSidebar') ? (
                  <AppSidebar />
                ) : (
                  <Sidebar collapsible='icon'>
                    <SidebarHeader>
                      <p className='mb-6 font-semibold'>Автомалярка</p>
                    </SidebarHeader>
                    <SidebarContent>
                      <nav className='flex flex-col gap-4'>
                        {Object.entries(titles).map(([key, title]) => (
                          <a key={key} href={`/dashboard/${key}`}>
                            {title}
                          </a>
                        ))}
                      </nav>
                    </SidebarContent>
                  </Sidebar>
                )}
                <DashboardInset id='main-content' tabIndex={-1} className='scroll-mt-16'>
                  <Header />
                  <FixturePage>
                    {route === 'users' ? (
                      <Suspense fallback={<p>Завантаження користувачів…</p>}>
                        <UsersTable />
                      </Suspense>
                    ) : route === 'payroll' ? (
                      <PayrollView
                        userId='browser-test'
                        orgId='org_test'
                        initialToday={businessToday()}
                      />
                    ) : route === 'reports' ? (
                      <ReportView
                        userId='browser-test'
                        orgId='org_test'
                        initialToday={businessToday()}
                        workerView={new URLSearchParams(location.search).get('role') === 'worker'}
                      />
                    ) : route === 'inventory' ? (
                      <InventoryView userId='browser-test' orgId='org_test' />
                    ) : route === 'team' ? (
                      <TeamView userId='browser-test' orgId='org_test' />
                    ) : route === 'kanban' ? (
                      <ProfiledBoard />
                    ) : route === 'overview' ? (
                      <Overview userId='browser-test' initialToday={businessToday()} />
                    ) : route === 'vehicles' ? (
                      <VehiclesView userId='browser-test' />
                    ) : (
                      <CrmWorkspaceView
                        userId='browser-test'
                        view={
                          route === 'clients'
                            ? 'customers'
                            : route === 'orders'
                              ? 'orders'
                              : 'requests'
                        }
                      />
                    )}
                  </FixturePage>
                </DashboardInset>
              </SidebarProvider>
            </ActiveThemeProvider>
          </ThemeProvider>
        </KBarProvider>
        <Toaster />
      </TooltipProvider>
    </NuqsAdapter>
  </QueryClientProvider>
);
