import { z } from 'zod';
import { vinSchema } from '../schemas/crm';

export const FALLBACK_MODELS: Record<string, string[]> = {
  AUDI: ['A3', 'A4', 'A5', 'A6', 'A8', 'Q3', 'Q5', 'Q7'],
  BMW: ['1 Series', '3 Series', '5 Series', '7 Series', 'X1', 'X3', 'X5', 'X6'],
  VOLKSWAGEN: ['Golf', 'Passat', 'Polo', 'Tiguan', 'Touareg', 'Touran', 'Transporter', 'ID.4'],
  TOYOTA: ['Corolla', 'Camry', 'RAV4', 'Land Cruiser', 'Prius', 'Yaris', 'Auris', 'Avensis'],
  FORD: ['Focus', 'Fiesta', 'Mondeo', 'Fusion', 'Kuga', 'Escape', 'Transit', 'Mustang'],
  SKODA: ['Octavia', 'Fabia', 'Superb', 'Kodiaq', 'Karoq', 'Scala', 'Rapid'],
  RENAULT: ['Megane', 'Scenic', 'Clio', 'Laguna', 'Duster', 'Kangoo', 'Trafic', 'Master'],
  'MERCEDES-BENZ': ['A-Class', 'C-Class', 'E-Class', 'S-Class', 'GLC', 'GLE', 'Vito', 'Sprinter'],
  HYUNDAI: ['Accent', 'Elantra', 'Sonata', 'Tucson', 'Santa Fe', 'i30', 'Ioniq'],
  KIA: ['Ceed', 'Rio', 'Sportage', 'Sorento', 'Optima', 'Soul'],
  NISSAN: ['Qashqai', 'X-Trail', 'Leaf', 'Juke', 'Almera', 'Rogue'],
  HONDA: ['Civic', 'Accord', 'CR-V', 'HR-V', 'Jazz'],
  MAZDA: ['2', '3', '6', 'CX-3', 'CX-5', 'CX-9'],
  OPEL: ['Astra', 'Corsa', 'Insignia', 'Vectra', 'Zafira', 'Vivaro'],
  PEUGEOT: ['206', '207', '208', '308', '508', '2008', '3008', 'Partner'],
  CITROEN: ['C3', 'C4', 'C5', 'Berlingo', 'Jumpy'],
  DACIA: ['Logan', 'Sandero', 'Duster', 'Lodgy'],
  VOLVO: ['S60', 'S80', 'V60', 'V70', 'XC60', 'XC90'],
  TESLA: ['Model 3', 'Model S', 'Model X', 'Model Y'],
  CHEVROLET: ['Aveo', 'Cruze', 'Lacetti', 'Malibu', 'Volt', 'Bolt'],
  MITSUBISHI: ['Lancer', 'Outlander', 'ASX', 'Pajero'],
  SUBARU: ['Forester', 'Outback', 'Impreza', 'Legacy'],
  SUZUKI: ['Swift', 'Vitara', 'SX4', 'Jimny'],
  FIAT: ['500', 'Doblo', 'Ducato', 'Tipo', 'Punto'],
  SEAT: ['Ibiza', 'Leon', 'Ateca'],
  LEXUS: ['IS', 'ES', 'RX', 'NX', 'LX'],
  PORSCHE: ['911', 'Cayenne', 'Macan', 'Panamera']
};

async function results(endpoint: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/${endpoint}`, {
    signal: AbortSignal.timeout(12000),
    next: { revalidate: 86400 }
  });
  if (!response.ok) throw new Error('Каталог тимчасово недоступний');
  const data = z
    .object({ Results: z.array(z.record(z.string(), z.unknown())) })
    .parse(await response.json());
  return data.Results;
}

export async function readCatalog(
  make: string
): Promise<{ makes: string[]; models: string[]; warning: string | null }> {
  const normalized = make.trim().toUpperCase();
  let makes = Object.keys(FALLBACK_MODELS);
  let models = FALLBACK_MODELS[normalized] ?? [];
  let warning: string | null = null;
  try {
    if (!normalized)
      makes = [
        ...makes,
        ...(await results('GetMakesForVehicleType/car?format=json')).map((row) =>
          String(row.MakeName ?? '')
            .trim()
            .toUpperCase()
        )
      ];
    else
      models = [
        ...models,
        ...(await results(`GetModelsForMake/${encodeURIComponent(normalized)}?format=json`)).map(
          (row) => String(row.Model_Name ?? '').trim()
        )
      ];
  } catch {
    warning = 'Зовнішній каталог недоступний. Показано резервний довідник та збережені автомобілі.';
  }
  return {
    makes: [...new Set(makes.filter(Boolean))].toSorted(),
    models: [...new Set(models.filter(Boolean))].toSorted(),
    warning
  };
}

export async function readVin(
  vin: string,
  year?: number
): Promise<{ make: string; model: string; year: number | null; message: string }> {
  const normalized = vinSchema.parse(vin);
  if (year !== undefined)
    z.number()
      .int()
      .min(1900)
      .max(new Date().getFullYear() + 1)
      .parse(year);
  const rows = await results(
    `DecodeVinValues/${normalized}?format=json${year ? `&modelyear=${year}` : ''}`
  );
  const row = rows[0] ?? {};
  const make = typeof row.Make === 'string' ? row.Make.trim().toUpperCase() : '';
  const model = typeof row.Model === 'string' ? row.Model.trim() : '';
  const parsedYear = Number(row.ModelYear);
  const decodedYear =
    Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= new Date().getFullYear() + 1
      ? parsedYear
      : null;
  return {
    make,
    model,
    year: decodedYear,
    message:
      !make && !model && !decodedYear
        ? 'Даних за цим VIN не знайдено. Виберіть марку, модель та рік вручну.'
        : ''
  };
}
