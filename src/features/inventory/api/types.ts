import type { CrmAccess, HistoryActor } from '@/features/crm/api/types';
import type { StockTag } from '../constants/tags';
import type { PageResult } from '@/features/crm/lib/pagination';

export interface StockItem {
  accountingMode?: 'quantity' | 'amount';
  id: string;
  name: string;
  unit: string;
  notes: string;
  tags: StockTag[];
  archived: boolean;
  locked: boolean;
  balanceMilli: number;
  totalCostCents: number | null;
  valuationRevision: number;
}

export interface StockMovement {
  accountingMode?: 'quantity' | 'amount';
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

export interface InventoryFilters {
  search: string;
  tags: StockTag[];
  archived: boolean;
  page?: number;
  pageSize?: number;
}

export interface InventoryItemsResponse extends PageResult<StockItem> {}

export interface MovementFilters {
  page?: number;
  pageSize?: number;
  itemId?: string;
  orderId?: string;
}
