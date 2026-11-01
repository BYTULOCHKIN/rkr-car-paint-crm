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
import { businessToday } from '@/features/crm/lib/workflow';
import { Sidebar, SidebarContent, SidebarHeader, SidebarProvider } from '@/components/ui/sidebar';
import { DashboardInset } from '@/components/layout/dashboard-inset';
import Header from '@/components/layout/header';
import { ActiveThemeProvider } from '@/components/themes/active-theme';
import ThemeProvider from '@/components/themes/theme-provider';
import { KBarProvider } from 'kbar';

const route = location.pathname.split('/').pop() ?? 'clients';
const titles: Record<string, string> = {
  overview: 'Огляд автомалярки',
  kanban: 'Дошка робіт',
  clients: 'Клієнти',
  orders: 'Замовлення',
  requests: 'Заявки',
  vehicles: 'Автомобілі'
};
if (new URLSearchParams(location.search).has('dark'))
  document.documentElement.classList.add('dark');
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <NuqsAdapter>
      <TooltipProvider>
        <KBarProvider actions={[]}>
          <ThemeProvider
            attribute='class'
            forcedTheme={new URLSearchParams(location.search).has('dark') ? 'dark' : 'light'}
          >
            <ActiveThemeProvider initialTheme='vercel'>
              <SidebarProvider
                defaultOpen={new URLSearchParams(location.search).get('sidebar') !== 'closed'}
              >
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
                <DashboardInset id='main-content' tabIndex={-1} className='scroll-mt-16'>
                  <Header />
                  <PageContainer
                    pageTitle={titles[route]}
                    pageDescription='Керування роботою автомалярки'
                  >
                    {route === 'kanban' ? (
                      <CrmKanbanBoard userId='browser-test' />
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
                  </PageContainer>
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
