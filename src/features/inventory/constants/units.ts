export const stockUnits = ['шт', 'л', 'кг', 'м'] as const;

export const stockUnitOptions = stockUnits.map((unit) => ({ value: unit, label: unit }));
