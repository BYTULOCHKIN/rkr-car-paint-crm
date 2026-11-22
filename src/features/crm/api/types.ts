import type { PaintSelection } from '../constants/paint-plan';
import type { OrderEconomicsDetails } from '@/features/order-economics/api/types';

export type { VehicleModelInput } from '../schemas/vehicle-model';

export interface CustomerContactValue {
  type: 'phone' | 'email';
  value: string;
}
export interface CustomerContact extends CustomerContactValue {
  id: string;
}
export interface Customer {
  contacts?: CustomerContact[];
  revision?: number;
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
  workflowRevision?: number;
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
  economics?: OrderEconomicsDetails;
  assigneeId?: string | null;
  assigneeName?: string | null;
  workflowRevision?: number;
  id: string;
  number: number;
  requestId: string | null;
  customerId: string;
  vehicleId: string;
  description: string;
  createdAt: string;
  items: OrderItem[];
  paintPlan?: PaintSelection[];
  totalCents: number;
  status: 'created' | 'in_progress' | 'ready' | 'delivered';
  plannedIntakeDate: string | null;
  plannedDeliveryDate: string | null;
  actualIntakeDate: string | null;
  actualReadyDate: string | null;
  actualDeliveryDate: string | null;
}

export type BoardStatus =
  | 'backlog'
  | 'scheduled'
  | 'created'
  | 'in_progress'
  | 'ready'
  | 'delivered';
export type WorkflowRecord =
  | { kind: 'request'; record: RepairRequest }
  | { kind: 'order'; record: RepairOrder };

export interface ActualDateChange {
  field: 'actualIntakeDate' | 'actualReadyDate' | 'actualDeliveryDate';
  before: string | null;
  after: string | null;
}

export interface OrderSnapshot {
  economics?: OrderEconomicsDetails;
  assigneeId?: string | null;
  assigneeName?: string | null;
  description: string;
  items: OrderItem[];
  paintPlan: PaintSelection[];
  totalCents: number;
}
export interface OrderContentChanges {
  before: OrderSnapshot;
  after: OrderSnapshot;
}
export interface HistoryActor {
  id: string;
  name: string;
}
export interface WorkflowEvent {
  actor?: HistoryActor | null;
  orderChanges?: OrderContentChanges | null;
  /** Missing on legacy events: factual changes may be embedded in note text. */
  actualDateChanges?: ActualDateChange[] | null;
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

export type CrmRole = 'admin' | 'worker';
export interface TeamMember {
  imageUrl?: string;
  id: string;
  name: string;
  identifier: string;
  role: CrmRole;
}
export interface CrmAccess {
  userId: string;
  orgId: string;
  role: CrmRole;
}
export interface PaymentEvent {
  id: string;
  operationId: string;
  orderId: string;
  kind: 'payment' | 'reversal';
  amountCents: number;
  reversalOf: string | null;
  note: string;
  actor: HistoryActor;
  createdAt: string;
}

export interface CrmWorkspace {
  payments?: PaymentEvent[];
  access?: CrmAccess;
  team?: TeamMember[];
  customers: Customer[];
  vehicles: Vehicle[];
  requests: RepairRequest[];
  orders: RepairOrder[];
  events: WorkflowEvent[];
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type CrmView = 'customers' | 'vehicles' | 'requests' | 'orders' | 'kanban';

export interface OrderDocument {
  order: RepairOrder;
  customer: Customer;
  vehicle: Vehicle;
}
