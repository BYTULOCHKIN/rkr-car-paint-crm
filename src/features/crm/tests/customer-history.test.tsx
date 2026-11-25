vi.mock('@/features/inventory/api/service', () => import('./inventory-stub'));
vi.mock('../api/service', () => ({ updateOrder: vi.fn() }));
import { expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CustomerHistory } from '../components/customer-history';
import { CrmEditorDialog } from '../components/editor-dialog';
import { customerVehicleHistory } from '../lib/customer-history';
import type { CrmWorkspace, RepairOrder } from '../api/types';

const customer = {
  id: 'customer',
  name: 'Руслан',
  phone: '0501234567',
  notes: 'Бажаний колір',
  createdAt: '2026-01-01'
};
const vehicle = {
  id: 'vehicle',
  customerId: customer.id,
  make: 'Ford',
  model: 'Focus',
  plate: 'AA1234AA',
  year: 2020,
  vin: 'WVWZZZ1JZXW000001'
};
const order: RepairOrder = {
  id: '00000000-0000-4000-8000-000000000001',
  number: 1,
  requestId: null,
  customerId: customer.id,
  vehicleId: vehicle.id,
  description: 'Фарбування капота',
  status: 'in_progress',
  createdAt: '2026-01-01',
  actualIntakeDate: '2026-01-01',
  actualReadyDate: null,
  actualDeliveryDate: null,
  plannedIntakeDate: null,
  plannedDeliveryDate: null,
  items: [{ description: 'Фарбування капота', quantity: 1, unitPriceCents: 10000 }],
  totalCents: 10000
};
const data: CrmWorkspace = {
  customers: [customer],
  vehicles: [
    vehicle,
    { ...vehicle, id: 'empty', model: 'Fiesta', vin: null, year: null, plate: '' },
    { ...vehicle, id: 'foreign', customerId: 'other' }
  ],
  orders: [
    order,
    { ...order, id: 'new', number: 2, createdAt: '2026-02-01', status: 'delivered' },
    { ...order, id: 'other', number: 3, customerId: 'other', vehicleId: 'foreign' }
  ],
  requests: [],
  events: []
};

test('history groups only the customer’s own cars and orders, sorts newest first, and leaves source data intact', () => {
  const original = JSON.stringify(data);
  const entries = customerVehicleHistory(data, customer.id);
  expect(entries).toHaveLength(2);
  expect(entries[0].orders.map((entry) => entry.number)).toEqual([2, 1]);
  expect(entries[0].activeCount).toBe(1);
  expect(entries[0].totalCents).toBe(20000);
  expect(entries[1].orders).toHaveLength(0);
  expect(JSON.stringify(data)).toBe(original);
});

test('selecting a car shows its VIN, order statuses, dates and totals without mixing other cars', async () => {
  const select = vi.fn();
  render(<CustomerHistory customer={customer} data={data} onSelectOrder={select} />);
  const panel = screen.getByRole('region', { name: 'Історія вибраного автомобіля' });
  expect(within(panel).getByText(vehicle.vin)).toBeDefined();
  expect(within(panel).getByText('В роботі')).toBeDefined();
  await userEvent.click(within(panel).getByRole('button', { name: 'Відкрити замовлення №2' }));
  expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: 'new' }));
  await userEvent.click(screen.getByRole('button', { name: /Обрати автомобіль Ford Fiesta/ }));
  expect(within(panel).getByText('Замовлень ще немає')).toBeDefined();
  expect(within(panel).getByText('VIN ще не додано')).toBeDefined();
  expect(within(panel).queryByRole('button', { name: 'Відкрити замовлення №1' })).toBeNull();
});

test('large order histories reveal older orders on demand', async () => {
  const orders = Array.from({ length: 8 }, (_, index) => ({
    ...order,
    id: String(index),
    number: index + 1
  }));
  render(
    <CustomerHistory customer={customer} data={{ ...data, orders }} onSelectOrder={vi.fn()} />
  );
  expect(screen.getAllByRole('button', { name: /Відкрити замовлення №/ })).toHaveLength(5);
  await userEvent.click(screen.getByRole('button', { name: 'Показати ще 3' }));
  expect(screen.getAllByRole('button', { name: /Відкрити замовлення №/ })).toHaveLength(8);
});

test('returning from an edited order asks before discarding and restores the same customer and car', async () => {
  const back = vi.fn();
  const close = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CrmEditorDialog
        editor={{ type: 'order', order, historyCustomer: customer }}
        data={data}
        onClose={close}
        onSelectOrder={vi.fn()}
        onBackToHistory={back}
      />
    </QueryClientProvider>
  );
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Опис замовлення' }), ' — зміни');
  await user.click(screen.getByRole('button', { name: 'До автомобілів клієнта' }));
  const confirmation = await screen.findByRole('alertdialog');
  expect(back).not.toHaveBeenCalled();
  await user.click(within(confirmation).getByRole('button', { name: 'Скасувати зміни' }));
  expect(back).toHaveBeenCalledWith(customer, vehicle.id);
  expect(close).not.toHaveBeenCalled();
});
