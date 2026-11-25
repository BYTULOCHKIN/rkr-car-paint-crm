import 'server-only';
import { getOrganizationContext } from './organization';
import { CrmError } from './repository';
import { crmListSchema, type CrmListFilters } from '../schemas/reads';
import type { CrmWorkspace } from '../api/types';

export async function readCrmList(orgId: string, input: CrmListFilters): Promise<CrmWorkspace> {
  const { access, team, repository } = await getOrganizationContext();
  if (access.orgId !== orgId) throw new CrmError('Автомалярку змінено. Оновіть сторінку.');
  const filters = crmListSchema.parse(input);
  if (access.role !== 'admin' && (filters.trash || !['orders', 'kanban'].includes(filters.entity)))
    throw new CrmError('Цей розділ доступний адміністратору');
  return { ...repository.reads.list(filters, team, access), access, team };
}
