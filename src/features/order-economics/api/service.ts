'use server';

import { z } from 'zod';
import { getOrganizationContext } from '@/features/crm/server/organization';
import { CrmError } from '@/features/crm/server/repository';
import type { ActionResult } from '@/features/crm/api/types';
import { saveEconomicsSchema, type SaveEconomicsInput } from '../schemas/details';
import { detailedCheckItems } from '../lib/details';
import { EconomicsError } from '../lib/integers';

export async function saveOrderEconomics(input: SaveEconomicsInput): Promise<ActionResult<void>> {
  try {
    const context = await getOrganizationContext();
    if (context.access.role !== 'admin') throw new CrmError('Ця дія доступна лише адміністратору');
    const value = saveEconomicsSchema.parse(input);
    if (value.orgId !== context.access.orgId)
      throw new CrmError('Автомалярку змінено. Оновіть сторінку.');
    const current = context.repository
      .workspace()
      .orders.find((order) => order.id === value.orderId);
    if (!current) throw new CrmError('Замовлення не знайдено');
    const names: Record<string, string> = {};
    for (const role of ['painter', 'polisher', 'assembler'] as const) {
      const id = value.details[`${role}Id`];
      if (!id) continue;
      const member = context.team.find((member) => member.id === id);
      if (member) names[id] = member.name;
      else if (current.economics?.[`${role}Id`] === id)
        names[id] = current.economics[`${role}Name`] ?? 'Колишній учасник';
      else throw new CrmError('Виберіть виконавця з активної команди автомалярки');
    }
    context.repository.updateOrder(
      {
        id: current.id,
        expectedRevision: value.expectedRevision,
        description: current.description,
        items: detailedCheckItems(value.details).map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPriceCents / 100
        }))
      },
      undefined,
      {
        id: context.access.userId,
        name: context.team.find((member) => member.id === context.access.userId)!.name
      },
      { details: value.details, workerNames: names }
    );
    return { ok: true, data: undefined };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { ok: false, error: error.issues[0]?.message ?? 'Перевірте деталізацію' };
    if (error instanceof CrmError || error instanceof EconomicsError)
      return { ok: false, error: error.message };
    return { ok: false, error: 'Не вдалося зберегти деталізований чек. Повторіть спробу.' };
  }
}
