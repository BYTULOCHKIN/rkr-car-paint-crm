import { z } from 'zod';

const catalogName = (label: string) =>
  z
    .string()
    .transform((value) => value.normalize('NFKC').trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(1, `Вкажіть ${label}`).max(80, 'Максимум 80 символів'));

export const vehicleModelSchema = z.object({
  make: catalogName('марку').transform((value) => value.toUpperCase()),
  model: catalogName('модель')
});

export type VehicleModelInput = z.input<typeof vehicleModelSchema>;
