import { z } from 'zod';

export const workerSpecialtiesSchema = z
  .array(z.enum(['painter', 'polisher', 'assembler', 'colorist']))
  .max(4)
  .refine(
    (values) => new Set(values).size === values.length,
    'Спеціалізації не мають повторюватись'
  );

export const teamMemberSettingsSchema = z.object({ specialties: workerSpecialtiesSchema }).strict();

export const updateTeamMemberSchema = teamMemberSettingsSchema
  .extend({ orgId: z.string().min(1).max(255), userId: z.string().min(1).max(255) })
  .strict();

export type UpdateTeamMemberInput = z.infer<typeof updateTeamMemberSchema>;
