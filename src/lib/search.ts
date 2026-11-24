export function normalizeSearch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('uk-UA').trim();
}

export function matchesSearchText(value: string, query: string): boolean {
  const text = normalizeSearch(value),
    search = normalizeSearch(query);
  if (!search || search.split(/\s+/).every((word) => text.includes(word))) return true;
  const compact = search.replace(/[^\p{L}\p{N}]/gu, '');
  return !!compact && text.replace(/[^\p{L}\p{N}]/gu, '').includes(compact);
}
