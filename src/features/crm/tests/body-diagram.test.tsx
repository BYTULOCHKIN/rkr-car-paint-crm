import { expect, test, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PaintPlanEditor } from '../components/paint-plan-editor';
import { OrderDocument } from '../components/order-document';
import type { OrderDocument as DocumentData } from '../api/types';
import type { PaintSelection } from '../constants/paint-plan';

function Editor() {
  const [value, onChange] = useState<PaintSelection[]>([]);
  return <PaintPlanEditor value={value} onChange={onChange} onBlur={() => {}} />;
}

test('keyboard selection toggles parts, updates paint mode, and synchronizes bumper views', async () => {
  render(<Editor />);
  const user = userEvent.setup();
  const diagram = screen.getByRole('group', { name: 'Схема кузова автомобіля' });
  const hood = within(diagram).getByRole('button', { name: 'Капот' });
  hood.focus();
  await user.keyboard('{Enter}');
  expect(
    within(diagram)
      .getByRole('button', { name: 'Капот: Одна сторона' })
      .getAttribute('aria-pressed')
  ).toBe('true');
  await user.click(screen.getByRole('button', { name: 'Часткове фарбування' }));
  hood.focus();
  await user.keyboard(' ');
  expect(screen.getByRole('list', { name: 'Позначені деталі' }).textContent).toContain(
    'Часткове фарбування'
  );
  await user.click(within(diagram).getAllByRole('button', { name: 'Передній бампер' })[0]);
  expect(
    within(diagram).getAllByRole('button', { name: 'Передній бампер: Частково' })
  ).toHaveLength(2);
  await user.click(
    within(diagram).getAllByRole('button', { name: 'Передній бампер: Частково' })[1]
  );
  expect(within(diagram).getAllByRole('button', { name: 'Передній бампер' })).toHaveLength(2);
});

test('disabled diagram cannot change a plan while a save is pending', () => {
  const change = vi.fn();
  render(<PaintPlanEditor value={[]} onChange={change} onBlur={vi.fn()} disabled />);
  expect(
    within(screen.getByRole('group', { name: 'Схема кузова автомобіля' })).queryAllByRole('button')
  ).toHaveLength(0);
  expect(
    (
      screen.getByRole('button', { name: 'Фарбування з однієї сторони' }) as HTMLButtonElement
    ).closest('fieldset')?.disabled
  ).toBe(true);
  expect(change).not.toHaveBeenCalled();
});

test('printed order contains customer, vehicle, priced work and the same read-only paint plan', () => {
  const document: DocumentData = {
    customer: { id: 'c', name: 'Олена', phone: '0501234567', notes: '', createdAt: '2026-11-16' },
    vehicle: {
      id: 'v',
      customerId: 'c',
      make: 'Ford',
      model: 'Focus',
      plate: 'AA1234AA',
      vin: 'WVWZZZ1JZXW000001',
      year: 2020
    },
    order: {
      id: 'o',
      number: 42,
      customerId: 'c',
      vehicleId: 'v',
      requestId: null,
      description: 'Фарбування кузова',
      assigneeId: 'user_worker',
      assigneeName: 'Маляр Андрій',
      createdAt: '2026-11-16',
      status: 'delivered',
      plannedIntakeDate: null,
      plannedDeliveryDate: null,
      actualIntakeDate: '2026-11-16',
      actualReadyDate: '2026-11-16',
      actualDeliveryDate: '2026-11-16',
      items: [{ description: 'Підготовка поверхні', quantity: 2, unitPriceCents: 12345 }],
      totalCents: 24690,
      paintPlan: [
        { partId: 'hood', mode: 'both_sides' },
        { partId: 'left_front_door', mode: 'one_side' },
        { partId: 'rear_bumper', mode: 'partial' }
      ]
    }
  };
  const { container } = render(<OrderDocument document={document} />);
  expect(screen.getByRole('heading', { name: 'Замовлення №42' })).toBeDefined();
  expect(screen.getByText('Олена')).toBeDefined();
  expect(container.textContent).not.toContain('Маляр Андрій');
  expect(container.textContent).not.toContain('Виконавець');
  expect(screen.getByText(/VIN: WVWZZZ1JZXW000001/)).toBeDefined();
  expect(screen.getByRole('table').textContent).toContain('Підготовка поверхні');
  expect(screen.getByText(/Разом:/).textContent).toContain('246,90');
  expect(screen.getByRole('list').textContent).toContain('Фарбування з двох сторін');
  expect(screen.getByRole('list').textContent).toContain('Фарбування з однієї сторони');
  expect(screen.getByRole('list').textContent).toContain('Часткове фарбування');
  const legend = screen.getByRole('group', { name: 'Легенда схеми' });
  expect(legend.querySelectorAll('svg')).toHaveLength(4);
  expect(legend.textContent).toContain('Не позначено');
  // Opaque pattern tiles prevent underlying body/theme fills from hiding the hatch in print.
  for (const pattern of container.querySelectorAll('pattern')) {
    expect(pattern.firstElementChild?.tagName.toLowerCase()).toBe('rect');
    expect(pattern.firstElementChild?.getAttribute('fill')).toContain('--paint-paper');
  }
  expect(container.querySelectorAll('path[fill^="url("]')).toHaveLength(4);
  expect(screen.queryAllByRole('button')).toHaveLength(0);
});
