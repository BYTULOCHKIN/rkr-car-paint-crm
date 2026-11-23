'use server';
import type { ActionResult } from '@/features/crm/api/types';
import type { SaveEconomicsInput } from '../schemas/details';
/** Compatibility response for an already open older client. */
export async function saveOrderEconomics(_input: SaveEconomicsInput): Promise<ActionResult<void>> {
  return {
    ok: false,
    error: 'Деталізацію замінено вкладками «Роботи» та «Матеріали і витрати». Оновіть сторінку.'
  };
}
