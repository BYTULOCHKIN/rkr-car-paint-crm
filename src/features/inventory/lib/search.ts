import type { StockItem } from '../api/types';
import type { StockTag } from '../constants/tags';

function searchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('uk-UA').trim();
}

export function filterStockItems(
  items: StockItem[],
  search: string,
  tags: StockTag[],
  archived: boolean
): StockItem[] {
  const words = searchText(search).split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (item.archived !== archived) return false;
    if (tags.length > 0 && !tags.some((tag) => item.tags.includes(tag))) return false;
    const text = searchText([item.name, item.notes, ...item.tags].join(' '));
    return words.every((word) => text.includes(word));
  });
}
