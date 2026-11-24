import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getOrganizationContext } from '@/features/crm/server/organization';
import { CrmError } from '@/features/crm/server/repository';
import { crmListSchema } from '@/features/crm/schemas/reads';

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
    const kind = z.enum(['list', 'order', 'history']).parse(params.get('kind'));
    const context = await getOrganizationContext();
    if (context.access.userId !== userId || context.access.orgId !== orgId)
      throw new CrmError('Немає доступу до автомалярки');
    let data;
    if (kind === 'list') {
      const input = Object.fromEntries(
        [...params].filter(([key]) => !['kind', 'orgId'].includes(key))
      );
      const filters = crmListSchema.parse({
        ...input,
        trash: z.enum(['true', 'false']).parse(params.get('trash') ?? 'false') === 'true',
        lookup: z.enum(['true', 'false']).parse(params.get('lookup') ?? 'false') === 'true'
      });
      if (context.access.role === 'worker' && !['orders', 'kanban'].includes(filters.entity))
        throw new CrmError('Цей розділ доступний адміністратору');
      if (filters.trash && context.access.role !== 'admin')
        throw new CrmError('Кошик доступний лише адміністратору');
      data = context.repository.reads.list(filters, context.team);
    } else {
      const id = z.string().uuid().parse(params.get('id'));
      const entity = z
        .enum(['order', 'customer', 'vehicle', 'request'])
        .parse(params.get('entity') ?? 'order');
      data =
        kind === 'order'
          ? context.repository.reads.order(id)
          : context.repository.reads.history(entity, id);
    }
    const finance = data.finance && {
      ...data.finance,
      events: data.finance.events.filter(
        (event) =>
          context.access.role === 'admin' ||
          (event.payee.kind === 'worker' && event.payee.id === userId)
      )
    };
    return NextResponse.json(
      { ...data, finance, access: context.access, team: context.team },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json({ error: 'Перевірте параметри запиту' }, { status: 400 });
    if (error instanceof CrmError)
      return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ error: 'Не вдалося завантажити дані CRM' }, { status: 500 });
  }
}
