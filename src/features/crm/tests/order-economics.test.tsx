vi.mock('../api/service', () => ({ getWorkspace: vi.fn() }));
vi.mock('@/features/inventory/api/service', () => import('./inventory-stub'));
import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrderExpenses } from '@/features/order-expenses/components/order-expenses';
import { OrderDocument } from '../components/order-document';
import type { RepairOrder, CrmWorkspace } from '../api/types';

const order: RepairOrder = {
  id: 'order',
  number: 1,
  requestId: null,
  customerId: 'c',
  vehicleId: 'v',
  description: 'Фарбування',
  createdAt: '2026-11-01',
  status: 'in_progress',
  actualIntakeDate: null,
  actualReadyDate: null,
  actualDeliveryDate: null,
  plannedIntakeDate: null,
  plannedDeliveryDate: null,
  items: [{ description: 'Бампер', quantity: 1, unitPriceCents: 1800000 }],
  totalCents: 1800000,
  economics: {
    employeeShareBps: 6000,
    painterId: 'p',
    polisherId: 'q',
    assemblerId: '',
    painterName: 'Ім’я маляра',
    polisherName: 'Ім’я полірувальника',
    lines: [
      {
        id: 'line',
        kind: 'painting',
        description: 'Бампер',
        quantity: 1,
        unitPriceCents: 1800000,
        polishingCents: 100000,
        subcontractCostCents: 0,
        contractorName: ''
      }
    ]
  }
};
test('worker sees subcontract expenses without editing controls', () => {
  const data: CrmWorkspace = {
    customers: [],
    vehicles: [],
    requests: [],
    orders: [order],
    events: [],
    access: { userId: 'worker', orgId: 'org_A', role: 'worker' }
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OrderExpenses
        order={{
          ...order,
          expenses: [
            {
              id: 'e',
              orderId: order.id,
              kind: 'color_matching',
              description: 'Підбір фарби',
              contractorId: 'c',
              contractorName: 'Колорист',
              amountCents: 250000
            }
          ]
        }}
        data={data}
        onStateChange={vi.fn()}
      />
    </QueryClientProvider>
  );
  expect(screen.getByText('Колорист · Підбір фарби')).toBeDefined();
  expect(screen.queryByRole('button')).toBeNull();
});
test('printed customer check contains client positions without internal portions, identities or wages', () => {
  const { container } = render(
    <OrderDocument
      document={{
        order,
        customer: { id: 'c', name: 'Клієнт', phone: '', notes: '', createdAt: '' },
        vehicle: {
          id: 'v',
          customerId: 'c',
          make: 'Ford',
          model: 'Focus',
          year: 2020,
          plate: '',
          vin: null
        }
      }}
    />
  );
  expect(container.textContent).toContain('Бампер');
  expect(container.textContent).toContain('18\u00a0000,00');
  expect(container.textContent).not.toContain('Ім’я маляра');
  expect(container.textContent).not.toContain('Ім’я полірувальника');
  expect(container.textContent).not.toContain('Внутрішня частина');
  expect(container.textContent).not.toContain('60%');
});
