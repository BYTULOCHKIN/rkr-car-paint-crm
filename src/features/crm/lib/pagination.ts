import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50)
});

export interface Pagination {
  page: number;
  pageSize: number;
}

export interface PageResult<T> extends Pagination {
  items: T[];
  total: number;
}

export { normalizeSearch } from '../../../lib/search';

export function uniqueRecords<T extends { id: string }>(rows: T[]): T[] {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}
