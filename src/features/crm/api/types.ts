export interface Customer {
  id: string;
  name: string;
  phone: string;
  notes: string;
  createdAt: string;
}

export interface Vehicle {
  id: string;
  customerId: string | null;
  make: string;
  model: string;
  plate: string;
  vin: string | null;
  year: number | null;
  createdAt?: string;
}

export interface RepairRequest {
  id: string;
  customerId: string;
  vehicleId: string;
  description: string;
  status: 'backlog' | 'scheduled' | 'converted';
  createdAt: string;
  plannedIntakeDate: string | null;
  plannedDeliveryDate: string | null;
}

export interface OrderItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export interface RepairOrder {
  id: string;
  number: number;
  requestId: string | null;
  customerId: string;
  vehicleId: string;
  description: string;
  createdAt: string;
  items: OrderItem[];
  totalCents: number;
  status: 'in_progress' | 'ready' | 'delivered';
  plannedIntakeDate: string | null;
  plannedDeliveryDate: string | null;
  actualIntakeDate: string | null;
  actualReadyDate: string | null;
  actualDeliveryDate: string | null;
}

export type BoardStatus = 'backlog' | 'scheduled' | 'in_progress' | 'ready' | 'delivered';
export type WorkflowRecord =
  | { kind: 'request'; record: RepairRequest }
  | { kind: 'order'; record: RepairOrder };

export interface WorkflowEvent {
  id: string;
  kind: 'request' | 'order';
  recordId: string;
  fromStatus: string | null;
  toStatus: string;
  previousIntakeDate: string | null;
  previousDeliveryDate: string | null;
  plannedIntakeDate: string | null;
  plannedDeliveryDate: string | null;
  note: string;
  createdAt: string;
}

export interface CrmWorkspace {
  customers: Customer[];
  vehicles: Vehicle[];
  requests: RepairRequest[];
  orders: RepairOrder[];
  events: WorkflowEvent[];
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type CrmView = 'customers' | 'vehicles' | 'requests' | 'orders' | 'kanban';
