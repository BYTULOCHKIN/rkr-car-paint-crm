import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { HistoryActor } from '@/features/crm/api/types';
import { EconomicsError } from '@/features/order-economics/lib/integers';
import { decimalScaled } from '@/features/inventory/schemas/inventory';
import { expenseNameKey, normalizeExpenseName } from '../lib/names';
import type { OrderExpenseName } from '../api/types';
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
        `SELECT id,orderId,kind,description,contractorId,contractorName,amountCents,expenseNameId,description AS expenseName,contractorUserId,note FROM crm_order_expenses WHERE archived=0${orderId ? ' AND orderId=?' : ''} ORDER BY createdAt,id`
      )
      .all(...(orderId ? [orderId] : []))
      .map((row) => ({ ...row })) as unknown as OrderExpense[];
  }

  names(): OrderExpenseName[] {
    return this.db
      .prepare('SELECT id,name,kind FROM crm_expense_names ORDER BY nameKey')
      .all()
      .map((row) => ({ ...row })) as unknown as OrderExpenseName[];
  }
  createName(value: string): OrderExpenseName {
    const name = normalizeExpenseName(value);
    if (!name || name.length > 120)
      throw new EconomicsError('Назва витрати має містити від 1 до 120 символів.');
    const nameKey = expenseNameKey(name);
    const existing = () =>
      this.db.prepare('SELECT id FROM crm_expense_names WHERE nameKey=?').get(nameKey);
    if (existing())
      throw new EconomicsError('Така назва витрати вже існує. Виберіть її зі списку.');
    const id = randomUUID();
    try {
      this.db
        .prepare('INSERT INTO crm_expense_names VALUES (?,?,?,?,?)')
        .run(id, name, nameKey, 'other', new Date().toISOString());
    } catch (error) {
      if (existing())
        throw new EconomicsError('Така назва витрати вже існує. Виберіть її зі списку.');
      throw error;
    }
    return { id, name, kind: 'other' };
  }

  save(
    input: OrderExpenseInput | RemoveOrderExpenseInput,
    actor: HistoryActor,
    remove = false,
    member?: { id: string; name: string }
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
        .prepare('SELECT workflowRevision FROM crm_orders WHERE id=? AND deletedAt IS NULL')
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
        const expenseName = this.names().find((entry) => entry.id === expense.expenseNameId);
        if (!expenseName) throw new EconomicsError('Назву витрати не знайдено. Оновіть список.');
        if (!member || member.id !== expense.contractorUserId)
          throw new EconomicsError('Виберіть субпідрядника з команди.');
        const name = member.name;
        const nameKey = `clerk-user:${member.id}`;
        let contractor = this.db
          .prepare('SELECT id,name FROM crm_contractors WHERE teamUserId=?')
          .get(member.id);
        if (!contractor) {
          const contractorId = randomUUID();
          this.db
            .prepare('INSERT INTO crm_contractors(id,name,nameKey,teamUserId) VALUES (?,?,?,?)')
            .run(contractorId, name, nameKey, member.id);
          contractor = { id: contractorId, name };
        } else
          this.db.prepare('UPDATE crm_contractors SET name=? WHERE id=?').run(name, contractor.id!);
        this.db
          .prepare(
            `INSERT INTO crm_order_expenses(id,orderId,kind,description,contractorId,contractorName,amountCents,createdAt,expenseNameId,contractorUserId,note) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,description=excluded.description,contractorId=excluded.contractorId,contractorName=excluded.contractorName,amountCents=excluded.amountCents,expenseNameId=excluded.expenseNameId,contractorUserId=excluded.contractorUserId,note=excluded.note`
          )
          .run(
            id,
            value.orderId,
            expenseName.kind,
            expenseName.name,
            contractor.id as string,
            name,
            decimalScaled(expense.amount, 2),
            new Date().toISOString(),
            expenseName.id,
            member.id,
            expense.note
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
