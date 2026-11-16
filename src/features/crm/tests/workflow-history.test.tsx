import { expect, test } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkflowHistory } from '../components/workflow-history';
import type { CrmWorkspace, WorkflowEvent, WorkflowRecord } from '../api/types';

const target: WorkflowRecord = {
  kind: 'request',
  record: {
    id: 'request',
    customerId: 'c',
    vehicleId: 'v',
    description: '',
    status: 'scheduled',
    createdAt: '',
    plannedIntakeDate: '2020-01-01',
    plannedDeliveryDate: null
  }
};
const data = (events: WorkflowEvent[]): CrmWorkspace => ({
  customers: [],
  vehicles: [],
  requests: [],
  orders: [],
  events
});
const event = (overrides: Partial<WorkflowEvent> = {}): WorkflowEvent => ({
  id: 'event',
  kind: 'request',
  recordId: 'request',
  fromStatus: 'scheduled',
  toStatus: 'scheduled',
  previousIntakeDate: '2020-01-01',
  previousDeliveryDate: null,
  plannedIntakeDate: '2020-01-03',
  plannedDeliveryDate: null,
  note: 'Немає місця в цеху',
  createdAt: '2026-11-16T10:00:00Z',
  actualDateChanges: [],
  ...overrides
});

test('history opens with separate before/after dates, reason and explicit Kyiv time', () => {
  render(<WorkflowHistory target={target} data={data([event()])} />);
  expect(screen.getByRole('heading', { name: 'Історія змін' }).closest('details')?.open).toBe(true);
  const events = screen.getByRole('list', { name: 'Події статусів і дат' });
  expect(within(events).getByRole('heading', { name: 'Дати оновлено' })).toBeDefined();
  expect(within(events).getByText('01.01.2020')).toBeDefined();
  expect(within(events).getByText('03.01.2020')).toBeDefined();
  expect(within(events).getByText('Немає місця в цеху')).toBeDefined();
  expect(within(events).getByText('16.11.2026 · 12:00:00')).toBeDefined();
});

test('long history shows five newest events then progressively reveals the remaining events', async () => {
  const events = Array.from({ length: 17 }, (_, index) =>
    event({
      id: String(index),
      note: `Примітка ${index}`,
      createdAt: `2026-11-${String(index + 1).padStart(2, '0')}T10:00:00Z`
    })
  );
  render(<WorkflowHistory target={target} data={data(events)} />);
  const list = screen.getByRole('list', { name: 'Події статусів і дат' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(5);
  expect(within(list).getAllByRole('listitem')[0].textContent).toContain('Примітка 16');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Показати ще' }));
  expect(within(list).getAllByRole('listitem')).toHaveLength(15);
  await user.click(screen.getByRole('button', { name: 'Показати ще' }));
  expect(within(list).getAllByRole('listitem')).toHaveLength(17);
  await user.click(screen.getByRole('button', { name: 'Згорнути до останніх 5' }));
  expect(within(list).getAllByRole('listitem')).toHaveLength(5);
});

test('legacy notes are preserved without fabricated date changes and empty history is explained', () => {
  const { rerender } = render(
    <WorkflowHistory
      target={target}
      data={data([
        event({
          plannedIntakeDate: '2020-01-01',
          actualDateChanges: null,
          note: 'Давня причина\nФактична видача: 2020-01-15 → —'
        })
      ])}
    />
  );
  expect(screen.getByText(/У старих подіях/)).toBeDefined();
  expect(screen.getByText(/Давня причина/).textContent).toContain('2020-01-15');
  expect(screen.queryByText('Було')).toBeNull();
  rerender(<WorkflowHistory target={target} data={data([])} />);
  expect(screen.getByText(/Збережених подій поки немає/)).toBeDefined();
});

test('edited order history shows description, unit price and total before and after', () => {
  const record = {
    ...target.record,
    status: 'in_progress' as const,
    number: 1,
    requestId: null,
    items: [],
    totalCents: 0,
    actualIntakeDate: null,
    actualReadyDate: null,
    actualDeliveryDate: null
  };
  const before = {
    description: 'Старий опис',
    items: [{ description: 'Фарбування', quantity: 1, unitPriceCents: 10000 }],
    paintPlan: [],
    totalCents: 10000
  };
  const after = {
    ...before,
    description: 'Новий опис',
    items: [{ ...before.items[0], unitPriceCents: 25000 }],
    totalCents: 25000
  };
  render(
    <WorkflowHistory
      target={{ kind: 'order', record }}
      data={data([
        event({
          kind: 'order',
          fromStatus: 'in_progress',
          toStatus: 'in_progress',
          previousIntakeDate: null,
          plannedIntakeDate: null,
          recordId: record.id,
          orderChanges: { before, after }
        })
      ])}
    />
  );
  expect(screen.getByRole('heading', { name: 'Замовлення змінено' })).toBeDefined();
  expect(screen.getByText('Старий опис')).toBeDefined();
  expect(screen.getByText('Новий опис')).toBeDefined();
  expect(screen.getByText('Позиція 1 · ціна за одиницю')).toBeDefined();
  expect(screen.getAllByText(/100,00\sгрн/)).toHaveLength(2);
  expect(screen.getAllByText(/250,00\sгрн/)).toHaveLength(2);
});
