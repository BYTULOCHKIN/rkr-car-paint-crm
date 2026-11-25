'use server';

import { z } from 'zod';
import type { ActionResult } from '@/features/crm/api/types';
import { getOrganizationContext } from '@/features/crm/server/organization';
import { CrmError } from '@/features/crm/server/repository';
import { EconomicsError } from '@/features/order-economics/lib/integers';
import { saveOrderLaborSchema, type SaveOrderLaborInput } from '../schemas/labor';

export async function saveOrderLabor(input: SaveOrderLaborInput): Promise<ActionResult<null>> {
  try {
    const { access, repository, team } = await getOrganizationContext();
    if (access.role !== 'admin') throw new CrmError('Ця дія доступна лише адміністратору.');
    const value = saveOrderLaborSchema.parse(input);
    if (value.orgId !== access.orgId) throw new CrmError('Автомалярку змінено. Оновіть сторінку.');
    repository.saveOrderLabor(value, team, {
      id: access.userId,
      name: team.find((member) => member.id === access.userId)!.name
    });
    return { ok: true, data: null };
  } catch (error) {
    if (error instanceof z.ZodError)
      return { ok: false, error: error.issues[0]?.message ?? 'Перевірте дані' };
    if (error instanceof CrmError || error instanceof EconomicsError)
      return { ok: false, error: error.message };
    return { ok: false, error: 'Не вдалося зберегти умови нарахування. Повторіть спробу.' };
  }
}
