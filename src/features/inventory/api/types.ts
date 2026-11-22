import type { CrmAccess, HistoryActor } from '@/features/crm/api/types';

export interface StockItem {
  id: string;
  name: string;
  unit: string;
  notes: string;
  archived: boolean;
  locked: boolean;
  balanceMilli: number;
  totalCostCents: number | null;
  valuationRevision: number;
}

export interface StockMovement {
  financialLocked?: boolean;
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  kind: 'receipt' | 'adjustment' | 'consumption' | 'reversal' | 'valuation';
  deltaMilli: number;
  costDeltaCents: number | null;
  valuationTotalCents: number | null;
  currency: 'UAH' | 'EUR' | null;
  purchaseAmountMinor: number | null;
  exchangeRateMicros: number | null;
  category: 'painting' | 'polishing' | null;
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
