'use server';

import { z } from 'zod';
import { getOrganizationContext } from '@/features/crm/server/organization';
import { CrmError } from '@/features/crm/server/repository';
import { InventoryError } from '@/features/inventory/server/repository';
import type { ActionResult } from '@/features/crm/api/types';
import type { CorrectionPreview, EconomicsPosting, SettlementPayee } from './types';
import { EconomicsError } from '../lib/integers';
import {
  cashSettlementSchema,
  reverseSettlementSchema,
  correctionSchema,
  financeSettingsSchema,
  type CashSettlementInput,
  type ReverseSettlementInput,
  type CorrectionInput
} from '../schemas/finance';

type Context = Awaited<ReturnType<typeof getOrganizationContext>>;
async function write<T>(orgId: string, work: (context: Context) => T): Promise<ActionResult<T>> {
  try {
    const context = await getOrganizationContext();
    if (context.access.orgId !== orgId)
      throw new EconomicsError('Автомалярку змінено. Оновіть сторінку.');
    if (context.access.role !== 'admin')
      throw new EconomicsError('Ця дія доступна лише адміністратору');
    return { ok: true, data: work(context) };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { ok: false, error: error.issues[0]?.message ?? 'Перевірте дані' };
    if (
      error instanceof EconomicsError ||
      error instanceof CrmError ||
      error instanceof InventoryError
    )
      return { ok: false, error: error.message };
    return { ok: false, error: 'Не вдалося провести фінансову операцію. Повторіть спробу.' };
  }
}
function actor(context: Context) {
  return {
    id: context.access.userId,
    name: context.team.find((member) => member.id === context.access.userId)!.name
  };
}
function correctionNames(context: Context, value: CorrectionInput): Record<string, string> {
  const workspace = context.repository.workspace();
  const order = workspace.orders.find((entry) => entry.id === value.orderId);
  if (!order) throw new EconomicsError('Замовлення не знайдено');
  const names: Record<string, string> = {};
  for (const role of ['painter', 'polisher', 'assembler'] as const) {
    const id = value.details[`${role}Id`];
    if (!id) continue;
    const member = context.team.find((member) => member.id === id);
    const historical = workspace.finance?.postings
      .filter((posting) => posting.orderId === order.id)
      .flatMap((posting) => posting.allocations)
      .find((entry) => entry.payee.kind === 'worker' && entry.payee.id === id);
    if (member) names[id] = member.name;
    else if (order.economics?.[`${role}Id`] === id)
      names[id] = order.economics[`${role}Name`] || 'Колишній учасник';
    else if (historical) names[id] = historical.payee.name;
    else throw new EconomicsError('Виберіть виконавця з команди автомалярки');
  }
  return names;
}
export async function recordSettlement(input: CashSettlementInput): Promise<ActionResult<void>> {
  return write(input.orgId, (context) => {
    const value = cashSettlementSchema.parse(input);
    const workspace = context.repository.workspace();
    const order = workspace.orders.find((order) => order.id === value.orderId);
    if (!order) throw new EconomicsError('Замовлення не знайдено');
    const known =
      workspace.finance?.events
        .filter((entry) => entry.orderId === order.id)
        .map((entry) => entry.payee) ?? [];
    for (const posting of workspace.finance?.postings ?? [])
      if (posting.orderId === order.id)
        known.push(...posting.allocations.map((entry) => entry.payee));
    for (const role of ['painter', 'polisher', 'assembler'] as const)
      if (order.economics?.[`${role}Id`])
        known.push({
          kind: 'worker',
          id: order.economics[`${role}Id`],
          name: order.economics[`${role}Name`] || 'Працівник'
        });
    for (const line of order.economics?.lines ?? [])
      if (line.contractorId)
        known.push({ kind: 'contractor', id: line.contractorId, name: line.contractorName });
    let payee: SettlementPayee | undefined;
    if (value.payeeKind === 'worker') {
      const member = context.team.find((member) => member.id === value.payeeId);
      if (member) payee = { kind: 'worker', id: member.id, name: member.name };
    }
    payee ??= known.find((entry) => entry.kind === value.payeeKind && entry.id === value.payeeId);
    if (!payee)
      throw new EconomicsError('Одержувач не належить команді або розрахункам цього замовлення');
    context.repository.settlements.cash(value, actor(context), payee);
  });
}
export async function reverseSettlement(
  input: ReverseSettlementInput
): Promise<ActionResult<void>> {
  return write(input.orgId, (context) =>
    context.repository.settlements.reverse(reverseSettlementSchema.parse(input), actor(context))
  );
}
export async function previewFinancialCorrection(
  input: CorrectionInput
): Promise<ActionResult<CorrectionPreview>> {
  return write(input.orgId, (context) => {
    const value = correctionSchema.parse(input);
    const result = context.repository.correctOrderEconomics(
      value,
      correctionNames(context, value),
      actor(context),
      true
    );
    if (!('after' in result))
      throw new EconomicsError('Це коригування вже проведено. Оновіть замовлення.');
    return result;
  });
}
export async function applyFinancialCorrection(
  input: CorrectionInput
): Promise<ActionResult<EconomicsPosting>> {
  return write(input.orgId, (context) => {
    const value = correctionSchema.parse(input);
    return context.repository.correctOrderEconomics(
      value,
      correctionNames(context, value),
      actor(context)
    ) as EconomicsPosting;
  });
}
export async function updateDefaultShare(
  input: z.infer<typeof financeSettingsSchema>
): Promise<ActionResult<void>> {
  return write(input.orgId, (context) =>
    context.repository.updateFinanceSettings(financeSettingsSchema.parse(input))
  );
}
