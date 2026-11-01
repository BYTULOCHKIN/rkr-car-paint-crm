import type { CrmWorkspace, Vehicle } from '@/features/crm/api/types';
import type { CustomerInput, VehicleInput, OrderInput } from '@/features/crm/schemas/crm';
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const longDescription =
  'Рихтування та фарбування переднього бампера, підготовка поверхні, підбір кольору та фінішне полірування. '.repeat(
    5
  );
const data: CrmWorkspace = { customers: [], vehicles: [], requests: [], orders: [], events: [] };
for (let index = 1; index <= 24; index++) {
  data.customers.push({
    id: uuid(index),
    name: index === 1 ? 'Тестовий клієнт із довгим прізвищем та ім’ям' : `Тестовий клієнт ${index}`,
    phone: '+380000000000',
    notes: 'Нотатка про бажаний колір і особливості ремонту. '.repeat(5),
    createdAt: '2026-10-30T12:00:00Z'
  });
  for (let car = 0; car < (index === 1 ? 7 : 1); car++)
    data.vehicles.push({
      id: uuid(100 + index * 10 + car),
      customerId: uuid(index),
      make: 'VOLKSWAGEN',
      model: 'Passat Alltrack',
      year: 2020,
      plate: 'TEST1234',
      vin: `WVWZZZ1JZXW${String(index * 10 + car).padStart(6, '0')}`,
      createdAt: '2026-10-30T12:00:00Z'
    });
  const vehicle = data.vehicles.find((entry) => entry.customerId === uuid(index))!;
  data.requests.push({
    id: uuid(500 + index),
    customerId: uuid(index),
    vehicleId: vehicle.id,
    description: longDescription,
    status: index < 3 ? 'converted' : 'scheduled',
    createdAt: '2026-10-30T12:00:00Z',
    plannedIntakeDate: '2026-10-30',
    plannedDeliveryDate: '2026-11-10'
  });
  data.orders.push({
    id: uuid(700 + index),
    number: index,
    requestId: index < 3 ? uuid(500 + index) : null,
    customerId: uuid(index),
    vehicleId: vehicle.id,
    description: longDescription,
    createdAt: '2026-10-30T12:00:00Z',
    status: 'in_progress',
    plannedIntakeDate: '2026-10-30',
    plannedDeliveryDate: '2026-11-10',
    actualIntakeDate: '2026-10-31',
    actualReadyDate: null,
    actualDeliveryDate: null,
    items: Array.from({ length: 12 }, (_, item) => ({
      description: `Підготовка та фарбування деталі ${item + 1}`,
      quantity: 1,
      unitPriceCents: 500000
    })),
    totalCents: 6000000
  });
}
if (location.pathname.endsWith('/kanban')) {
  data.customers[0].name = 'НадзвичайноДовгеПрізвищеБезПробілів'.repeat(5);
  data.vehicles[0].model = 'ДужеДовгаНазваМоделіБезПробілів'.repeat(3).slice(0, 80);
  data.orders[0].description = 'РоботаБезПробілів'.repeat(35);
  for (let index = 2; index < data.requests.length; index++) {
    data.requests[index].status = index % 2 ? 'scheduled' : 'backlog';
    if (data.requests[index].status === 'backlog') data.requests[index].plannedIntakeDate = null;
  }
  for (let index = 0; index < data.orders.length; index++) {
    data.orders[index].status =
      index % 3 === 0 ? 'in_progress' : index % 3 === 1 ? 'ready' : 'delivered';
    if (data.orders[index].status !== 'in_progress')
      data.orders[index].actualReadyDate = '2026-10-31';
    if (data.orders[index].status === 'delivered')
      data.orders[index].actualDeliveryDate = '2026-10-31';
  }
}
if (location.pathname.endsWith('/overview')) {
  data.orders[1].status = 'ready';
  data.orders[1].actualReadyDate = '2026-10-31';
  data.orders[2].status = 'delivered';
  data.orders[2].actualReadyDate = '2026-10-30';
  data.orders[2].actualDeliveryDate = '2026-10-31';
  data.requests[2].plannedIntakeDate = '2026-10-31';
  data.requests[3].plannedIntakeDate = '2026-11-02';
  data.orders[0].plannedDeliveryDate = '2026-11-03';
  data.orders[1].plannedDeliveryDate = '2026-11-01';
  for (let month = 0; month < 6; month++) {
    data.requests[month].createdAt = `2026-${String(5 + month).padStart(2, '0')}-10T12:00:00Z`;
    data.orders[month].createdAt = `2026-${String(5 + month).padStart(2, '0')}-10T12:00:00Z`;
  }
}
export async function getWorkspace() {
  if (new URLSearchParams(location.search).has('empty'))
    return { customers: [], vehicles: [], orders: [], requests: [], events: [] };
  return structuredClone(data);
}
export async function getVehicleCatalog(make: string) {
  return {
    makes: ['VOLKSWAGEN', 'BMW', 'FORD'],
    models: make === 'BMW' ? ['X3', 'X5'] : ['Passat Alltrack', 'Golf'],
    warning: null
  };
}
export async function decodeVehicleVin() {
  return { make: 'BMW', model: 'X3', year: 2020, message: '' };
}
export async function createCustomer(input: CustomerInput) {
  const id = crypto.randomUUID();
  data.customers.push({ ...input, id, createdAt: new Date().toISOString() });
  return { ok: true as const, data: id };
}
export async function createVehicle(input: VehicleInput) {
  const id = crypto.randomUUID();
  data.vehicles.push({
    ...input,
    id,
    customerId: input.customerId || null,
    vin: input.vin || null
  });
  return { ok: true as const, data: id };
}
export async function updateVehicle(input: VehicleInput & { id: string }) {
  const vehicle = data.vehicles.find((entry) => entry.id === input.id);
  if (vehicle) Object.assign(vehicle, input);
  return { ok: true as const, data: null };
}
export async function createOrder(_input: OrderInput) {
  return { ok: true as const, data: crypto.randomUUID() };
}
export async function createRequest() {
  return { ok: true as const, data: crypto.randomUUID() };
}
export async function updateOrder() {
  return { ok: true as const, data: null };
}
export async function updateWorkflow() {
  return { ok: true as const, data: null };
}
export async function updateVehicleVin() {
  return { ok: true as const, data: null };
}
export async function assignVehicle() {
  return { ok: true as const, data: null };
}
export async function deleteVehicle(id: Vehicle['id']) {
  data.vehicles = data.vehicles.filter((entry) => entry.id !== id);
  return { ok: true as const, data: null };
}
