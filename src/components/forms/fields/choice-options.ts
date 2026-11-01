export interface ChoiceOption {
  value: string;
  label: string;
  description?: string;
  keywords?: string[];
  disabled?: boolean;
}

export const CHOICE_POPUP_CLASS_NAME =
  'max-h-[min(280px,var(--available-height))] max-w-(--available-width) overscroll-contain [scrollbar-width:thin] sm:max-h-[min(320px,var(--available-height))]';

export function splitRecentOptions(
  options: ChoiceOption[],
  recentValues: string[]
): { recent: ChoiceOption[]; remaining: ChoiceOption[] } {
  const byValue = new Map(options.map((option) => [option.value, option]));
  const recent = [...new Set(recentValues)]
    .flatMap((value) => byValue.get(value) ?? [])
    .slice(0, 5);
  const recentSet = new Set(recent.map((option) => option.value));
  return { recent, remaining: options.filter((option) => !recentSet.has(option.value)) };
}

export function choiceLabel(option: ChoiceOption): string {
  return [option.label, option.description].filter(Boolean).join(' · ');
}

function normalizeSearch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('uk-UA').trim();
}

export function matchesChoice(option: ChoiceOption, query: string): boolean {
  const text = normalizeSearch([choiceLabel(option), ...(option.keywords ?? [])].join(' '));
  const search = normalizeSearch(query);
  if (!search || search.split(/\s+/).every((word) => text.includes(word))) return true;
  // Phone numbers, VINs and plates remain searchable without their display formatting.
  const compact = search.replace(/[^\p{L}\p{N}]/gu, '');
  return !!compact && text.replace(/[^\p{L}\p{N}]/gu, '').includes(compact);
}
