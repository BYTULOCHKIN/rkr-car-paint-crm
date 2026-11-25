import { netSalarySnapshot } from '@/features/order-expenses/lib/snapshot';
import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type { HistoryActor, RepairOrder } from '@/features/crm/api/types';
import type { OrderMaterialCosts } from '@/features/inventory/lib/order-costs';
import type {
  CorrectionPreview,
  EconomicsPosting,
  SettlementEvent,
  SettlementPayee,
  PayeeAccrual
} from '../api/types';
import { previewDetailedEconomics } from '../lib/details';
import { EconomicsError } from '../lib/integers';
import { aggregateAccruals, accrualDeltas, settlementBalance } from '../lib/settlements';
import {
  cashSettlementSchema,
  reverseSettlementSchema,
  type CashSettlementInput,
  type ReverseSettlementInput
} from '../schemas/finance';
import { decimalScaled } from '@/features/inventory/schemas/inventory';

export class SettlementRepository {
  constructor(private readonly db: DatabaseSync) {}
  postings(orderIds?: string[], to?: string): EconomicsPosting[] {
    return this.db
      .prepare(
        `SELECT * FROM crm_economics_postings WHERE ${orderIds ? `orderId IN (SELECT value FROM json_each(?))` : '1=1'}${to ? ' AND (crm_day(createdAt)<=? OR crm_day(createdAt) IS NULL)' : ''} ORDER BY orderId,revision`
      )
      .all(...(orderIds ? [JSON.stringify(orderIds)] : []), ...(to ? [to] : []))
      .map((row) => ({
        ...JSON.parse(row.snapshot as string),
        id: row.id,
        operationId: row.operationId,
        orderId: row.orderId,
        revision: row.revision,
        kind: row.kind,
        note: row.note,
        actor: JSON.parse(row.actor as string),
        createdAt: row.createdAt
      })) as EconomicsPosting[];
  }
  latest(orderId: string): EconomicsPosting | null {
    return this.postings([orderId]).at(-1) ?? null;
  }
  events(orderIds?: string[], to?: string, from?: string): SettlementEvent[] {
    return this.db
      .prepare(
        `SELECT * FROM crm_settlement_events WHERE ${orderIds ? `orderId IN (SELECT value FROM json_each(?))` : '1=1'}${to ? ` AND ((crm_day(createdAt)<=?${from ? ' AND crm_day(createdAt)>=?' : ''}) OR crm_day(createdAt) IS NULL)` : ''} ORDER BY createdAt,rowid`
      )
      .all(
        ...(orderIds ? [JSON.stringify(orderIds)] : []),
        ...(to ? [to, ...(from ? [from] : [])] : [])
      )
      .map((row) => ({
        id: row.id,
        orderId: row.orderId,
        payee: { kind: row.payeeKind, id: row.payeeId, name: row.payeeName },
        kind: row.kind,
        amountCents: row.amountCents,
        postingId: row.postingId,
        reversalOf: row.reversalOf,
        note: row.note,
        actor: JSON.parse(row.actor as string),
        createdAt: row.createdAt
      })) as SettlementEvent[];
  }
  reversalSources(ids: string[]): SettlementEvent[] {
    if (!ids.length) return [];
    const rows = this.db
      .prepare(`SELECT * FROM crm_settlement_events WHERE id IN (SELECT value FROM json_each(?))`)
      .all(JSON.stringify(ids));
    return rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      payee: { kind: row.payeeKind, id: row.payeeId, name: row.payeeName },
      kind: row.kind,
      amountCents: row.amountCents,
      postingId: row.postingId,
      reversalOf: row.reversalOf,
      note: row.note,
      actor: JSON.parse(row.actor as string),
      createdAt: row.createdAt
    })) as SettlementEvent[];
  }

  private transaction<T>(work: () => T): T {
    if (this.db.isTransaction) return work();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  private duplicateCash(id: string, fingerprint: string): boolean {
    if (this.db.prepare('SELECT id FROM crm_economics_postings WHERE operationId=?').get(id))
      throw new EconomicsError('Ідентифікатор операції вже використано для розрахунку');
    const row = this.db.prepare('SELECT fingerprint FROM crm_settlement_events WHERE id=?').get(id);
    if (!row) return false;
    if (row.fingerprint !== fingerprint)
      throw new EconomicsError('Ідентифікатор операції вже використано з іншими даними');
    return true;
  }
  duplicatePosting(operationId: string, fingerprint: string): EconomicsPosting | null {
    if (this.db.prepare('SELECT id FROM crm_settlement_events WHERE id=?').get(operationId))
      throw new EconomicsError('Ідентифікатор операції вже використано для виплати');
    const row = this.db
      .prepare('SELECT fingerprint FROM crm_economics_postings WHERE operationId=?')
      .get(operationId);
    if (!row) return null;
    if (row.fingerprint !== fingerprint)
      throw new EconomicsError('Ідентифікатор коригування вже використано з іншими даними');
    return this.postings().find((entry) => entry.operationId === operationId)!;
  }
  prepare(order: RepairOrder, costs: OrderMaterialCosts): CorrectionPreview {
    if (!order.economics) throw new EconomicsError('Спочатку деталізуйте чек');
    const preview = previewDetailedEconomics(order.economics, costs);
    if (!preview.result || preview.issues.length)
      throw new EconomicsError(preview.issues.join(' ') || 'Перевірте економіку');
    const details = order.economics;
    const allocations: PayeeAccrual[] = [];
    for (const [role, amountCents] of [
      ['painter', preview.result.painterAccrualCents],
      ['polisher', preview.result.polisherAccrualCents],
      ['assembler', preview.result.assemblerAccrualCents]
    ] as const) {
      if (details[`${role}Id`])
        allocations.push({
          payee: {
            kind: 'worker',
            id: details[`${role}Id`],
            name: details[`${role}Name`] || 'Працівник'
          },
          amountCents
        });
    }
    for (const line of details.lines)
      if (line.kind !== 'painting' && line.kind !== 'assembly') {
        if (!line.contractorId) throw new EconomicsError('Підрядник не визначений');
        allocations.push({
          payee: { kind: 'contractor', id: line.contractorId, name: line.contractorName },
          amountCents: line.subcontractCostCents
        });
      }
    const before = this.latest(order.id);
    const after = {
      details,
      costs: costs as EconomicsPosting['costs'],
      result: preview.result,
      allocations: aggregateAccruals(allocations)
    };
    return { before, after, deltas: accrualDeltas(before?.allocations ?? [], after.allocations) };
  }
  post(
    order: RepairOrder,
    costs: OrderMaterialCosts,
    operationId: string,
    note: string,
    actor: HistoryActor,
    fingerprint: string
  ): EconomicsPosting {
    if (!this.db.isTransaction)
      throw new EconomicsError('Проведення потребує транзакції замовлення');
    const duplicate = this.duplicatePosting(operationId, fingerprint);
    if (duplicate) return duplicate;
    const preview = this.prepare(order, costs);
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    const revision = (preview.before?.revision ?? 0) + 1;
    const kind = preview.before ? 'correction' : 'initial';
    this.db
      .prepare('INSERT INTO crm_economics_postings VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(
        id,
        operationId,
        order.id,
        revision,
        kind,
        JSON.stringify(preview.after),
        note,
        JSON.stringify(actor),
        createdAt,
        fingerprint
      );
    for (const delta of preview.deltas)
      this.insertEvent(
        randomUUID(),
        order.id,
        delta.payee,
        kind === 'initial' ? 'accrual' : 'adjustment',
        delta.amountCents,
        id,
        null,
        note,
        actor,
        `posting:${id}`
      );
    return this.latest(order.id)!;
  }
  /** Immutable snapshots and signed deltas preserve earlier accruals and payouts. */
  syncNet(order: RepairOrder, costs: OrderMaterialCosts, actor: HistoryActor, note: string): void {
    if (!this.db.isTransaction)
      throw new EconomicsError('Нарахування потребує транзакції замовлення');
    const snapshot = netSalarySnapshot(order, costs);
    const allocations = snapshot.allocations;
    const previous = this.latest(order.id);
    if (
      previous &&
      previous.model === snapshot.model &&
      JSON.stringify({
        model: previous.model,
        expenses: previous.expenses,
        details: previous.details,
        costs: previous.costs,
        result: previous.result,
        allocations: previous.allocations
      }) === JSON.stringify(snapshot)
    )
      return;
    const id = randomUUID();
    const kind = previous ? 'correction' : 'initial';
    this.db
      .prepare('INSERT INTO crm_economics_postings VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(
        id,
        `auto:${id}`,
        order.id,
        (previous?.revision ?? 0) + 1,
        kind,
        JSON.stringify(snapshot),
        note,
        JSON.stringify(actor),
        new Date().toISOString(),
        `auto:${id}`
      );
    for (const delta of accrualDeltas(previous?.allocations ?? [], allocations))
      this.insertEvent(
        randomUUID(),
        order.id,
        delta.payee,
        previous ? 'adjustment' : 'accrual',
        delta.amountCents,
        id,
        null,
        note,
        actor,
        `posting:${id}`
      );
  }
  onReady(order: RepairOrder, costs: OrderMaterialCosts, actor: HistoryActor): void {
    if (!order.economics) return; // Legacy/unclassified checks never receive invented accruals.
    const preview = this.prepare(order, costs);
    if (preview.before) {
      if (
        JSON.stringify(preview.before.details) !== JSON.stringify(preview.after.details) ||
        JSON.stringify(preview.before.costs) !== JSON.stringify(preview.after.costs)
      )
        throw new EconomicsError('Зміни після нарахування потрібно провести коригуванням');
      return;
    }
    this.post(order, costs, `ready:${order.id}`, 'Готовність авто', actor, `ready:${order.id}`);
  }
  cash(input: CashSettlementInput, actor: HistoryActor, payee: SettlementPayee): void {
    const value = cashSettlementSchema.parse(input);
    const fingerprint = JSON.stringify({ value, actorId: actor.id });
    this.transaction(() => {
      if (this.duplicateCash(value.operationId, fingerprint)) return;
      if (
        !this.db
          .prepare('SELECT id FROM crm_orders WHERE id=? AND deletedAt IS NULL')
          .get(value.orderId)
      )
        throw new EconomicsError('Замовлення не знайдено');
      if (payee.kind !== value.payeeKind || payee.id !== value.payeeId)
        throw new EconomicsError('Одержувач не відповідає операції');
      const amount = decimalScaled(value.amount, 2);
      const balance = settlementBalance(this.events(), value.orderId, payee);
      if (value.kind === 'return' && amount > balance.paidCents)
        throw new EconomicsError('Повернення перевищує дійсні виплати');
      this.insertEvent(
        value.operationId,
        value.orderId,
        payee,
        value.kind,
        amount,
        null,
        null,
        value.note,
        actor,
        fingerprint
      );
      settlementBalance(this.events(), value.orderId, payee);
    });
  }
  reverse(input: ReverseSettlementInput, actor: HistoryActor): void {
    const value = reverseSettlementSchema.parse(input);
    const fingerprint = JSON.stringify({ value, actorId: actor.id });
    this.transaction(() => {
      if (this.duplicateCash(value.operationId, fingerprint)) return;
      const events = this.events();
      const original = events.find((entry) => entry.id === value.eventId);
      if (!original || (original.kind !== 'payout' && original.kind !== 'return'))
        throw new EconomicsError('Виплату або повернення не знайдено');
      if (events.some((entry) => entry.reversalOf === original.id))
        throw new EconomicsError('Операцію вже скасовано');
      const simulated: SettlementEvent = {
        ...original,
        id: value.operationId,
        kind: 'reversal',
        reversalOf: original.id
      };
      settlementBalance([...events, simulated], original.orderId, original.payee);
      this.insertEvent(
        value.operationId,
        original.orderId,
        original.payee,
        'reversal',
        original.amountCents,
        null,
        original.id,
        value.note,
        actor,
        fingerprint
      );
    });
  }
  private insertEvent(
    id: string,
    orderId: string,
    payee: SettlementPayee,
    kind: SettlementEvent['kind'],
    amount: number,
    postingId: string | null,
    reversalOf: string | null,
    note: string,
    actor: HistoryActor,
    fingerprint: string
  ): void {
    this.db
      .prepare('INSERT INTO crm_settlement_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        id,
        orderId,
        payee.kind,
        payee.id,
        payee.name,
        kind,
        amount,
        postingId,
        reversalOf,
        note,
        JSON.stringify(actor),
        new Date().toISOString(),
        fingerprint
      );
  }
}
