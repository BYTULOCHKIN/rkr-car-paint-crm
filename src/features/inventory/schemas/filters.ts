import { z } from 'zod';
import { stockTags } from '../constants/tags';

export const inventoryFiltersSchema = z
  .object({
    search: z.string().trim().max(500).default(''),
    tags: z
      .array(z.enum(stockTags))
      .max(stockTags.length)
      .transform((tags) => [...new Set(tags)])
      .default([]),
    archived: z.boolean().default(false)
  })
  .strict();
