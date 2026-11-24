import { z } from 'zod';
import { stockTags } from '../constants/tags';
import { paginationSchema } from '../../crm/lib/pagination';

export const inventoryFiltersSchema = z
  .object({
    ...paginationSchema.shape,
    search: z.string().trim().max(500).default(''),
    tags: z
      .array(z.enum(stockTags))
      .max(stockTags.length)
      .transform((tags) => [...new Set(tags)])
      .default([]),
    archived: z.boolean().default(false)
  })
  .strict();

export const movementFiltersSchema = paginationSchema
  .extend({
    itemId: z.string().uuid().optional(),
    orderId: z.string().uuid().optional()
  })
  .strict();
