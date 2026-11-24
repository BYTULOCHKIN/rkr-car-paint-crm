export type OrderExpenseKind = 'color_matching' | 'soldering' | 'other';

export interface OrderExpenseName {
  id: string;
  name: string;
  kind: OrderExpenseKind;
}

export interface OrderExpense {
  expenseNameId?: string;
  expenseName?: string;
  contractorUserId?: string | null;
  note?: string;
  id: string;
  orderId: string;
  kind: OrderExpenseKind;
  description: string;
  contractorId: string;
  contractorName: string;
  amountCents: number;
}

export interface NetOrderResult {
  checkCents: number;
  materialsCents: number;
  subcontractCents: number;
  baseCents: number;
  employeeShareBps: number;
  employeeCents: number;
  workshopCents: number;
}
