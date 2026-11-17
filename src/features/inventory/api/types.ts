import type { CrmAccess, HistoryActor } from '@/features/crm/api/types';

export interface StockItem {
  id: string;
  name: string;
  unit: string;
  notes: string;
  archived: boolean;
  locked: boolean;
  balanceMilli: number;
}

export interface StockMovement {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  kind: 'receipt' | 'adjustment' | 'consumption' | 'reversal';
  deltaMilli: number;
  orderId: string | null;
  orderNumber: number | null;
  reversesId: string | null;
  reversed: boolean;
  note: string;
  actor: HistoryActor;
  createdAt: string;
}

export interface InventoryData {
  access: CrmAccess;
  items: StockItem[];
  movements: StockMovement[];
}
