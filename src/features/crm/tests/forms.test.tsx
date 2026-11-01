import { beforeEach, describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { RequestForm, OrderForm } from '../components/forms';
import { CrmEditorDialog } from '../components/editor-dialog';
import { SummaryCards } from '../components/summary-cards';
import { createRequest } from '../api/service';
import { useAppForm } from '@/lib/form';
import type { CrmWorkspace } from '../api/types';

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

const first = '00000000-0000-4000-8000-000000000001';
const second = '00000000-0000-4000-8000-000000000002';
const carId = '00000000-0000-4000-8000-000000000003';
const otherCarId = '00000000-0000-4000-8000-000000000004';
const data: CrmWorkspace = {
  customers: [
    { id: first, name: 'Олена', phone: '+380501234567', notes: '', createdAt: '2026-10-31' },
    { id: second, name: 'Андрій', phone: '+380671234567', notes: '', createdAt: '2026-10-31' }
  ],
  vehicles: [
    {
      id: carId,
      customerId: first,
      year: 2020,
      make: 'Volkswagen',
      model: 'Golf',
      plate: 'AA1234BC',
      vin: 'WVWZZZ1JZXW000001'
    },
    {
      id: otherCarId,
      customerId: second,
      year: 2020,
      make: 'Ford',
      model: 'Focus',
      plate: 'AA5678BC',
      vin: null
    }
  ],
  events: [],
  requests: [],
  orders: []
};

function renderForm(element: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

function ExistingSelection() {
  const form = useAppForm({ defaultValues: { customer: first } });
  return (
    <form.AppField name='customer'>
      {(field) => <field.SelectField label='Клієнт' options={[{ value: first, label: 'Олена' }]} />}
    </form.AppField>
  );
}

async function select(label: string, option: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name: option }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createRequest).mockResolvedValue({ ok: true, data: 'saved' });
});

describe('CRM dependent fields', () => {
  test('selected labels are human readable while submitted values remain IDs', async () => {
    const saved = vi.fn();
    const user = userEvent.setup();
    renderForm(<RequestForm data={data} onSaved={saved} />);
    await select('Клієнт *', /Олена/);
    expect(screen.getByRole('combobox', { name: 'Клієнт *' }).textContent).toContain('Олена');
    expect(screen.getByRole('combobox', { name: 'Клієнт *' }).textContent).not.toContain(first);
    await select('Автомобіль *', /Volkswagen Golf/);
    await user.type(
      screen.getByRole('textbox', { name: 'Що потрібно зробити *' }),
      'Фарбування бампера'
    );
    await user.click(screen.getByRole('button', { name: 'Зберегти заявку' }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(createRequest).toHaveBeenCalledWith({
      customerId: first,
      vehicleId: carId,
      description: 'Фарбування бампера',
      plannedIntakeDate: '',
      plannedDeliveryDate: ''
    });
  });

  test('an existing selection renders its label before the dropdown has ever opened', () => {
    renderForm(<ExistingSelection />);
    expect(screen.getByRole('combobox', { name: 'Клієнт' }).textContent).toContain('Олена');
  });

  test('no customers shows instructions, disables selects and prevents submission', () => {
    renderForm(<RequestForm data={{ ...data, customers: [], vehicles: [] }} onSaved={vi.fn()} />);
    expect((screen.getByRole('combobox', { name: 'Клієнт *' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.getAllByText(/Клієнтів ще немає/).length).toBeGreaterThan(0);
    expect(
      (screen.getByRole('combobox', { name: 'Автомобіль *' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Зберегти заявку' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  test('vehicle stays disabled before a client is selected and explains an empty client garage', async () => {
    renderForm(<RequestForm data={{ ...data, vehicles: [] }} onSaved={vi.fn()} />);
    expect(screen.getAllByText(/Спочатку виберіть клієнта/).length).toBeGreaterThan(0);
    await select('Клієнт *', /Олена/);
    expect(screen.getAllByText(/У цього клієнта ще немає автомобілів/).length).toBeGreaterThan(0);
    expect(
      (screen.getByRole('combobox', { name: 'Автомобіль *' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  test('changing customer clears the old vehicle and only offers the new customer’s cars', async () => {
    renderForm(<RequestForm data={data} onSaved={vi.fn()} />);
    await select('Клієнт *', /Олена/);
    await select('Автомобіль *', /Volkswagen/);
    await select('Клієнт *', /Андрій/);
    const trigger = screen.getByRole('combobox', { name: 'Автомобіль *' });
    expect(trigger.textContent).not.toContain('Volkswagen');
    expect(
      (screen.getByRole('button', { name: 'Зберегти заявку' }) as HTMLButtonElement).disabled
    ).toBe(true);
    await userEvent.setup().click(trigger);
    expect(await screen.findByRole('option', { name: /Ford/ })).toBeDefined();
    expect(screen.queryByRole('option', { name: /Volkswagen/ })).toBeNull();
  });

  test('an order explains why cars without VIN cannot be selected', async () => {
    renderForm(<OrderForm data={data} onSaved={vi.fn()} />);
    await select('Клієнт *', /Андрій/);
    expect(screen.getAllByText(/Немає автомобілів із VIN/).length).toBeGreaterThan(0);
    expect(
      (screen.getByRole('combobox', { name: 'Автомобіль *' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Взяти в роботу' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  test('failed saves keep the form data and show the server’s error inline', async () => {
    vi.mocked(createRequest).mockResolvedValue({
      ok: false,
      error: 'Автомобіль більше недоступний'
    });
    const saved = vi.fn();
    renderForm(<RequestForm data={data} onSaved={saved} />);
    await select('Клієнт *', /Олена/);
    await select('Автомобіль *', /Volkswagen/);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Що потрібно зробити *' }), 'Фарбування');
    await user.click(screen.getByRole('button', { name: 'Зберегти заявку' }));
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      'Автомобіль більше недоступний'
    );
    expect(
      (screen.getByRole('textbox', { name: 'Що потрібно зробити *' }) as HTMLTextAreaElement).value
    ).toBe('Фарбування');
    expect(saved).not.toHaveBeenCalled();
  });
});

test('pending saves lock inputs, cancel and dialog dismissal until completion', async () => {
  let finish: ((value: Awaited<ReturnType<typeof createRequest>>) => void) | undefined;
  vi.mocked(createRequest).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const close = vi.fn();
  renderForm(
    <CrmEditorDialog
      editor={{ type: 'request' }}
      data={data}
      onClose={close}
      onSelectOrder={vi.fn()}
    />
  );
  await select('Клієнт *', /Олена/);
  await select('Автомобіль *', /Volkswagen/);
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Що потрібно зробити *' }), 'Фарбування');
  await user.click(screen.getByRole('button', { name: 'Зберегти заявку' }));
  expect(
    screen.getByRole('textbox', { name: 'Що потрібно зробити *' }).closest('fieldset')?.disabled
  ).toBe(true);
  expect((screen.getByRole('button', { name: 'Закрити' }) as HTMLButtonElement).disabled).toBe(
    true
  );
  expect((screen.getByRole('button', { name: 'Скасувати' }) as HTMLButtonElement).disabled).toBe(
    true
  );
  await user.keyboard('{Escape}');
  expect(close).not.toHaveBeenCalled();
  finish?.({ ok: true, data: 'saved' });
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
});

test('removing an order position keeps the remaining work and amount', async () => {
  renderForm(<OrderForm data={data} onSaved={vi.fn()} />);
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Робота 1 *' }), 'Фарбування');
  await user.click(screen.getByRole('button', { name: 'Додати позицію' }));
  await user.type(screen.getByRole('textbox', { name: 'Робота 2 *' }), 'Полірування');
  await user.clear(screen.getAllByRole('spinbutton', { name: 'Ціна за одиницю, грн *' })[1]);
  await user.type(screen.getAllByRole('spinbutton', { name: 'Ціна за одиницю, грн *' })[1], '500');
  await user.click(screen.getByRole('button', { name: 'Видалити роботу 1' }));
  expect((screen.getByRole('textbox', { name: 'Робота 1 *' }) as HTMLInputElement).value).toBe(
    'Полірування'
  );
  expect(
    (screen.getByRole('spinbutton', { name: 'Ціна за одиницю, грн *' }) as HTMLInputElement).value
  ).toBe('500');
  expect(screen.getByText(/Разом:/).textContent).toContain('500');
});

test('closing a dirty modal requests confirmation and continuing preserves input', async () => {
  const close = vi.fn();
  renderForm(
    <CrmEditorDialog
      editor={{ type: 'customer' }}
      data={data}
      onClose={close}
      onSelectOrder={vi.fn()}
    />
  );
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox', { name: 'Ім’я клієнта *' }), 'Новий клієнт');
  await user.click(screen.getByRole('button', { name: 'Скасувати' }));
  const confirmation = await screen.findByRole('alertdialog');
  expect(close).not.toHaveBeenCalled();
  await user.click(within(confirmation).getByRole('button', { name: 'Продовжити редагування' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect((screen.getByRole('textbox', { name: 'Ім’я клієнта *' }) as HTMLInputElement).value).toBe(
    'Новий клієнт'
  );
  await user.click(screen.getByRole('button', { name: 'Скасувати' }));
  await user.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Скасувати зміни' })
  );
  expect(close).toHaveBeenCalledOnce();
});

test('summary cards use dashboard composition and accessible navigation', () => {
  const { container } = render(<SummaryCards data={data} />);
  expect(container.querySelectorAll('[data-slot=card-header]')).toHaveLength(3);
  expect(container.querySelectorAll('[data-slot=card-footer]')).toHaveLength(3);
  expect(screen.getByRole('link', { name: 'Клієнти: 2' }).getAttribute('href')).toBe(
    '/dashboard/clients'
  );
});
