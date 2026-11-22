export function stockQuantity(milli: number): string {
  return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 3 }).format(milli / 1000);
}
export const movementLabels = {
  receipt: 'Надходження',
  adjustment: 'Коригування',
  consumption: 'Списання',
  reversal: 'Скасування списання',
  valuation: 'Оцінювання залишку'
};
export const materialCategoryOptions = [
  { value: 'painting', label: 'Малярні роботи' },
  { value: 'polishing', label: 'Полірування' }
];
