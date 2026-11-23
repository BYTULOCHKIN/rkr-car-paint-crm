import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { HistoryActor } from '@/features/crm/api/types';
import { EconomicsError } from '@/features/order-economics/lib/integers';
import { decimalScaled } from '@/features/inventory/schemas/inventory';
import type { OrderExpense } from '../api/types';
import {
  orderExpenseSchema,
  removeOrderExpenseSchema,
  type OrderExpenseInput,
  type RemoveOrderExpenseInput
} from '../schemas/expenses';

export class OrderExpenseRepository {
  constructor(
    private readonly db: DatabaseSync,
    private readonly onChange: (orderId: string, actor: HistoryActor, note: string) => void
  ) {}

  list(orderId?: string): OrderExpense[] {
    return this.db
      .prepare(
        `SELECT id,orderId,kind,description,contractorId,contractorName,amountCents FROM crm_order_expenses WHERE archived=0${orderId ? ' AND orderId=?' : ''} ORDER BY createdAt,id`
      )
      .all(...(orderId ? [orderId] : []))
      .map((row) => ({ ...row })) as unknown as OrderExpense[];
  }

  save(
    input: OrderExpenseInput | RemoveOrderExpenseInput,
    actor: HistoryActor,
    remove = false
  ): string {
    const value = remove ? removeOrderExpenseSchema.parse(input) : orderExpenseSchema.parse(input);
    const fingerprint = JSON.stringify({ value, actorId: actor.id, remove });
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const duplicate = this.db
        .prepare(
          'SELECT fingerprint,expenseId FROM crm_order_expense_operations WHERE operationId=?'
        )
        .get(value.operationId);
      if (duplicate) {
        if (duplicate.fingerprint !== fingerprint)
          throw new EconomicsError('Операцію вже використано з іншими даними.');
        this.db.exec('COMMIT');
        return duplicate.expenseId as string;
      }
      const order = this.db
        .prepare('SELECT workflowRevision FROM crm_orders WHERE id=?')
        .get(value.orderId);
      if (!order) throw new EconomicsError('Замовлення не знайдено.');
      if (order.workflowRevision !== value.expectedRevision)
        throw new EconomicsError('Замовлення змінилося. Оновіть його перед збереженням витрат.');
      const id = value.id ?? value.operationId;
      if (!value.id && this.db.prepare('SELECT id FROM crm_order_expenses WHERE id=?').get(id))
        throw new EconomicsError('Ідентифікатор витрати вже використано.');
      const before = this.db
        .prepare('SELECT * FROM crm_order_expenses WHERE id=? AND orderId=? AND archived=0')
        .get(id, value.orderId);
      if ((remove || value.id) && !before)
        throw new EconomicsError('Витрату вже змінено або видалено.');
      if (remove) this.db.prepare('UPDATE crm_order_expenses SET archived=1 WHERE id=?').run(id);
      else {
        const expense = orderExpenseSchema.parse(value);
        const name = expense.contractorName.replace(/\s+/g, ' ');
        const nameKey = name.toLocaleLowerCase('uk-UA');
        let contractor = this.db
          .prepare('SELECT id,name FROM crm_contractors WHERE nameKey=?')
          .get(nameKey);
        if (!contractor) {
          const contractorId = randomUUID();
          this.db
            .prepare('INSERT INTO crm_contractors VALUES (?,?,?)')
            .run(contractorId, name, nameKey);
          contractor = { id: contractorId, name };
        }
        this.db
          .prepare(
            `INSERT INTO crm_order_expenses(id,orderId,kind,description,contractorId,contractorName,amountCents,createdAt) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,description=excluded.description,contractorId=excluded.contractorId,contractorName=excluded.contractorName,amountCents=excluded.amountCents`
          )
          .run(
            id,
            value.orderId,
            expense.kind,
            expense.description,
            contractor.id as string,
            contractor.name as string,
            decimalScaled(expense.amount, 2),
            new Date().toISOString()
          );
      }
      const after = this.db.prepare('SELECT * FROM crm_order_expenses WHERE id=?').get(id);
      this.db
        .prepare('INSERT INTO crm_order_expense_operations VALUES (?,?,?,?,?,?,?)')
        .run(
          value.operationId,
          fingerprint,
          value.orderId,
          id,
          JSON.stringify({ before: before ?? null, after }),
          JSON.stringify(actor),
          new Date().toISOString()
        );
      this.db
        .prepare(
          "UPDATE crm_orders SET salaryModel='net',workflowRevision=workflowRevision+1 WHERE id=?"
        )
        .run(value.orderId);
      this.onChange(
        value.orderId,
        actor,
        `${remove ? 'Видалено' : before ? 'Змінено' : 'Додано'} витрату: ${after?.description as string}; ${after?.contractorName as string}; ${(Number(before?.amountCents ?? 0) / 100).toFixed(2)} → ${(remove ? 0 : Number(after?.amountCents ?? 0) / 100).toFixed(2)} грн`
      );
      this.db.exec('COMMIT');
      return id;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
