import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { VehicleForm } from '../components/vehicle-form';
import { createVehicle, decodeVehicleVin, updateVehicle, deleteVehicle } from '../api/service';
import { CrmEditorDialog } from '../components/editor-dialog';
import { VehicleActions } from '../components/vehicle-actions';
import type { CrmWorkspace, Vehicle } from '../api/types';

vi.mock('../api/service', () => ({
  getVehicleCatalog: vi.fn(async (make: string) => ({
    makes: ['FORD', 'BMW'],
    models: make === 'BMW' ? ['X3', 'X5'] : ['Focus', 'Fiesta'],
    warning: null
  })),
  decodeVehicleVin: vi.fn(),
  updateVehicle: vi.fn(),
  deleteVehicle: vi.fn(),
  createVehicle: vi.fn(),
  createCustomer: vi.fn(),
  createRequest: vi.fn(),
  createOrder: vi.fn(),
  updateOrder: vi.fn(),
  updateVehicleVin: vi.fn(),
  updateWorkflow: vi.fn(),
  assignVehicle: vi.fn(),
  getWorkspace: vi.fn()
}));
const empty: CrmWorkspace = { customers: [], vehicles: [], requests: [], orders: [], events: [] };
function setup(data = empty) {
  const saved = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
        })
      }
    >
      <VehicleForm data={data} onSaved={saved} />
    </QueryClientProvider>
  );
  return saved;
}
async function choose(label: string, name: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(await screen.findByRole('option', { name }));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createVehicle).mockResolvedValue({ ok: true, data: 'saved' });
});

test('only make, model and year are required; customer and VIN may be empty', async () => {
  const saved = setup();
  await waitFor(() =>
    expect((screen.getByRole('combobox', { name: 'Марка *' }) as HTMLButtonElement).disabled).toBe(
      false
    )
  );
  await choose('Марка *', 'FORD');
  await choose('Модель *', 'Focus');
  await choose('Рік *', '2020');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Додати автомобіль' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(createVehicle).toHaveBeenCalledWith({
    make: 'FORD',
    model: 'Focus',
    year: 2020,
    customerId: '',
    plate: '',
    vin: ''
  });
});

test('changing make clears the model; VIN can fill all required fields', async () => {
  setup();
  await waitFor(() =>
    expect((screen.getByRole('combobox', { name: 'Марка *' }) as HTMLButtonElement).disabled).toBe(
      false
    )
  );
  await choose('Марка *', 'FORD');
  await choose('Модель *', 'Focus');
  await choose('Марка *', 'BMW');
  expect(screen.getByRole('combobox', { name: 'Модель *' }).textContent).not.toContain('Focus');
  vi.mocked(decodeVehicleVin).mockResolvedValue({
    make: 'BMW',
    model: 'X3',
    year: 2011,
    message: 'Дані vPIC отримано'
  });
  await userEvent
    .setup()
    .type(screen.getByRole('textbox', { name: 'VIN (необов’язково)' }), '5UXWX7C50BA123456');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Заповнити за VIN' }));
  await waitFor(() =>
    expect(screen.getByRole('combobox', { name: 'Модель *' }).textContent).toContain('X3')
  );
  expect(screen.queryByText('Дані vPIC отримано')).toBeNull();
  expect(screen.getByRole('combobox', { name: 'Модель *' }).textContent).toContain('X3');
  expect(screen.getByRole('combobox', { name: 'Рік *' }).textContent).toContain('2011');
});

test('recent selections appear first without duplicated options', async () => {
  setup({
    ...empty,
    vehicles: [2020, 2019, 2018, 2017, 2016, 2015].map((year, index) => ({
      id: String(index),
      customerId: null,
      make: 'FORD',
      model: 'Focus',
      plate: '',
      vin: null,
      year
    }))
  });
  await userEvent.setup().click(screen.getByRole('combobox', { name: 'Рік *' }));
  const values = (await screen.findAllByRole('option')).map((option) => option.textContent);
  expect(values.slice(0, 5)).toEqual(['2020', '2019', '2018', '2017', '2016']);
  expect(values.filter((value) => value === '2020')).toHaveLength(1);
});

test('a VIN service failure leaves manual selections available', async () => {
  setup();
  vi.mocked(decodeVehicleVin).mockRejectedValue(new Error('Network unavailable'));
  await userEvent
    .setup()
    .type(screen.getByRole('textbox', { name: 'VIN (необов’язково)' }), '5UXWX7C50BA123456');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Заповнити за VIN' }));
  expect(await screen.findByText(/Не вдалося отримати дані VIN/)).toBeDefined();
  expect((screen.getByRole('combobox', { name: 'Марка *' }) as HTMLButtonElement).disabled).toBe(
    false
  );
});

test('VIN warning is a focusable tooltip beside the field', async () => {
  setup();
  const user = userEvent.setup();
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Інформація про VIN' }));
  expect((await screen.findByRole('tooltip')).textContent).toContain(
    'Дані за VIN можуть бути неповними'
  );
});

const existing: Vehicle = {
  id: '00000000-0000-4000-8000-000000000001',
  customerId: null,
  make: 'FORD',
  model: 'Focus',
  year: 2020,
  plate: '',
  vin: null
};
test('editing uses the update action and preserves vehicle ID', async () => {
  vi.mocked(updateVehicle).mockResolvedValue({ ok: true, data: null });
  const saved = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <VehicleForm vehicle={existing} data={{ ...empty, vehicles: [existing] }} onSaved={saved} />
    </QueryClientProvider>
  );
  await userEvent
    .setup()
    .type(screen.getByRole('textbox', { name: 'Держномер (необов’язково)' }), 'AA1234BC');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Зберегти зміни' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(updateVehicle).toHaveBeenCalledWith(
    expect.objectContaining({ id: existing.id, plate: 'AA1234BC', year: 2020 })
  );
  expect(createVehicle).not.toHaveBeenCalled();
});

test('vehicle menu opens the editor; deleting requires separate confirmation', async () => {
  const edit = vi.fn();
  const { unmount } = render(<VehicleActions vehicle={existing} data={empty} edit={edit} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Дії з авто FORD Focus' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Редагувати' }));
  expect(edit).toHaveBeenCalledWith({ type: 'vehicle', vehicle: existing });
  unmount();
  vi.mocked(deleteVehicle).mockResolvedValue({ ok: true, data: null });
  const close = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CrmEditorDialog
        editor={{ type: 'deleteVehicle', vehicle: existing }}
        data={empty}
        onClose={close}
        onSelectOrder={vi.fn()}
      />
    </QueryClientProvider>
  );
  expect(deleteVehicle).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Видалити автомобіль' }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(deleteVehicle).toHaveBeenCalledWith(existing.id);
});
