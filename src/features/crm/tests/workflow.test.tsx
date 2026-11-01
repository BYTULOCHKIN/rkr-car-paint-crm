import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { WorkflowForm } from '../components/workflow-form';
import { CrmKanbanBoard } from '../components/kanban-board';
import { WorkflowDates } from '../components/workflow-details';
import { updateWorkflow } from '../api/service';
import { crmQueries } from '../api/queries';
import type { CrmWorkspace, RepairRequest, RepairOrder } from '../api/types';
import { businessToday } from '../lib/workflow';

vi.mock('../api/service', () => ({
  createCustomer: vi.fn(),
  updateVehicle: vi.fn(),
  deleteVehicle: vi.fn(),
  createVehicle: vi.fn(),
  createRequest: vi.fn(),
  createOrder: vi.fn(),
  updateOrder: vi.fn(),
  updateVehicleVin: vi.fn(),
  getVehicleCatalog: vi.fn().mockResolvedValue({ makes: [], models: [], warning: null }),
  decodeVehicleVin: vi.fn(),
  assignVehicle: vi.fn(),
  getWorkspace: vi.fn(),
  updateWorkflow: vi.fn()
}));

const id = '00000000-0000-4000-8000-000000000001';
const request: RepairRequest = {
  id,
  customerId: id,
  vehicleId: id,
  description: 'Фарбування',
  status: 'scheduled',
  createdAt: '2020-01-01T00:00:00Z',
  plannedIntakeDate: '2020-01-01',
  plannedDeliveryDate: '2020-01-10'
};
const order: RepairOrder = {
  ...request,
  id: '00000000-0000-4000-8000-000000000002',
  status: 'ready',
  number: 1,
  requestId: id,
  items: [{ description: 'Фарбування', quantity: 1, unitPriceCents: 10000 }],
  totalCents: 10000,
  actualIntakeDate: '2020-01-05',
  actualReadyDate: '2020-01-07',
  actualDeliveryDate: null
};
const data: CrmWorkspace = {
  customers: [{ id, name: 'Олена', phone: '0501234567', notes: '', createdAt: '2020-01-01' }],
  vehicles: [
    {
      id,
      customerId: id,
      year: 2020,
      make: 'Ford',
      model: 'Focus',
      plate: 'AA1234BC',
      vin: 'WVWZZZ1JZXW000001'
    }
  ],
  requests: [{ ...request, status: 'converted' }],
  orders: [order],
  events: []
};

function renderUi(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } }
  });
  client.setQueryData(crmQueries.workspace('admin').queryKey, data);
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(updateWorkflow).mockResolvedValue({ ok: true, data: null });
});

test('rescheduling submits new plan, reason and expected status without factual dates', async () => {
  const saved = vi.fn();
  const { container } = renderUi(
    <WorkflowForm target={{ kind: 'request', record: request }} onSaved={saved} />
  );
  const input = container.querySelector('input[name=plannedIntakeDate]') as HTMLInputElement;
  const user = userEvent.setup();
  await user.clear(input);
  await user.type(input, '2020-01-03');
  await user.type(
    screen.getByRole('textbox', { name: 'Примітка / причина перенесення' }),
    'Немає місця в цеху'
  );
  await user.click(screen.getByRole('button', { name: 'Зберегти статус і дати' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(updateWorkflow).toHaveBeenCalledWith(
    expect.objectContaining({
      id,
      kind: 'request',
      expectedStatus: 'scheduled',
      status: 'scheduled',
      plannedIntakeDate: '2020-01-03',
      plannedDeliveryDate: '2020-01-10',
      actualIntakeDate: '',
      note: 'Немає місця в цеху'
    })
  );
});

test('planned column requires a receipt date before saving a backlog request', async () => {
  renderUi(
    <WorkflowForm
      target={{
        kind: 'request',
        record: { ...request, status: 'backlog', plannedIntakeDate: null }
      }}
      requestedStatus='scheduled'
      onSaved={vi.fn()}
    />
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Зберегти статус і дати' }));
  expect(await screen.findByText('Для запису вкажіть дату прийому')).toBeDefined();
  expect(updateWorkflow).not.toHaveBeenCalled();
});

test('delivery defaults to today and preserves earlier factual and planned dates', async () => {
  const saved = vi.fn();
  renderUi(
    <WorkflowForm
      target={{ kind: 'order', record: order }}
      requestedStatus='delivered'
      onSaved={saved}
    />
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Зберегти статус і дати' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(updateWorkflow).toHaveBeenCalledWith(
    expect.objectContaining({
      status: 'delivered',
      plannedIntakeDate: '2020-01-01',
      plannedDeliveryDate: '2020-01-10',
      actualIntakeDate: '2020-01-05',
      actualReadyDate: '2020-01-07',
      actualDeliveryDate: businessToday()
    })
  );
});

test('board has one card after conversion and opens the existing order workflow', async () => {
  renderUi(<CrmKanbanBoard userId='admin' />);
  expect(screen.getAllByText('Замовлення №1')).toHaveLength(1);
  expect(screen.queryByText('Заявка', { exact: true })).toBeNull();
  expect(screen.getByRole('heading', { name: 'Заплановано' })).toBeDefined();
  expect(screen.getByRole('heading', { name: 'Видано' })).toBeDefined();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Статус і дати' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByRole('combobox', { name: 'Статус *' }).textContent).toContain(
    'Готово'
  );
});

test('a delivered car shows lateness against the promise without an overdue warning', () => {
  render(
    <WorkflowDates
      target={{
        kind: 'order',
        record: { ...order, status: 'delivered', actualDeliveryDate: '2020-01-15' }
      }}
    />
  );
  expect(screen.getByText('Видано пізніше плану')).toBeDefined();
  expect(screen.queryByText('Прострочено видачу')).toBeNull();
  expect(screen.getByText('15.01.2020')).toBeDefined();
});
