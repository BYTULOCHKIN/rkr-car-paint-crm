import type { OrderExpenseKind, OrderExpenseName } from '../api/types';

export function normalizeExpenseName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/gu, ' ')
    .trim();
}
export function expenseNameKey(value: string): string {
  return normalizeExpenseName(value).toLocaleLowerCase('uk-UA');
}
export const defaultExpenseNames: OrderExpenseName[] = [
  { id: 'color_matching', name: 'Підбір фарби', kind: 'color_matching' },
  { id: 'soldering', name: 'Пайка', kind: 'soldering' },
  { id: 'other', name: 'Інший субпідряд', kind: 'other' }
];
export function legacyExpenseName(kind: OrderExpenseKind): string {
  return defaultExpenseNames.find((entry) => entry.kind === kind)!.name;
}
