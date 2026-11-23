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
  _input: CorrectionInput
): Promise<ActionResult<CorrectionPreview>> {
  return {
    ok: false,
    error: 'Розрахунок оновлюється автоматично після збереження робіт або витрат.'
  };
}
export async function applyFinancialCorrection(
  _input: CorrectionInput
): Promise<ActionResult<EconomicsPosting>> {
  return {
    ok: false,
    error: 'Розрахунок оновлюється автоматично після збереження робіт або витрат.'
  };
}
export async function updateDefaultShare(
  input: z.infer<typeof financeSettingsSchema>
): Promise<ActionResult<void>> {
  return write(input.orgId, (context) =>
    context.repository.updateFinanceSettings(financeSettingsSchema.parse(input))
  );
}
