import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrganizationContext } from '@/features/crm/server/organization';
import { CrmError } from '@/features/crm/server/repository';
import { movementFiltersSchema } from '@/features/inventory/schemas/filters';

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { userId, orgId } = await auth();
    if (!userId)
      return NextResponse.json({ error: 'Увійдіть у свій обліковий запис' }, { status: 401 });
    const params = new URL(request.url).searchParams;
    if (!orgId || params.get('orgId') !== orgId)
      return NextResponse.json(
        { error: 'Автомалярку змінено. Оновіть сторінку.' },
        { status: 403 }
      );
    const filters = movementFiltersSchema.parse({
      page: params.get('page') ?? undefined,
      pageSize: params.get('pageSize') ?? undefined,
      itemId: params.get('itemId') ?? undefined,
      orderId: params.get('orderId') ?? undefined
    });
    const { access, repository } = await getOrganizationContext();
    if (access.orgId !== orgId || access.userId !== userId)
      return NextResponse.json({ error: 'Немає доступу до автомалярки' }, { status: 403 });
    return NextResponse.json(repository.inventory.listMovements(filters), {
      headers: { 'Cache-Control': 'private, no-store' }
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: 'Перевірте параметри' }, { status: 400 });
    if (error instanceof CrmError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: 'Не вдалося завантажити операції' }, { status: 500 });
  }
}
