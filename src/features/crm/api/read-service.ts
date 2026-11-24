import { apiClient } from '@/lib/api-client';
import type { CrmWorkspace } from './types';
import type { CrmListFilters } from '../schemas/reads';

export function getCrmList(
  orgId: string,
  filters: CrmListFilters,
  signal?: AbortSignal
): Promise<CrmWorkspace> {
  const params = new URLSearchParams({ orgId, kind: 'list' });
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined) params.set(key, String(value));
  return apiClient(`/crm/read?${params}`, { signal, cache: 'no-store' });
}

export function getCrmDetail(
  orgId: string,
  kind: 'order' | 'history',
  id: string,
  entity: 'order' | 'customer' | 'vehicle' | 'request' = 'order',
  signal?: AbortSignal
): Promise<CrmWorkspace> {
  const params = new URLSearchParams({ orgId, kind, id, entity });
  return apiClient(`/crm/read?${params}`, { signal, cache: 'no-store' });
}
