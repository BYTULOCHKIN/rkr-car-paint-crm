const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1
});
const percentage = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
  useGrouping: false
});

/** Compact presentation only; calculations and accessible amounts retain full precision. */
export function compactNumber(value: number): string {
  return compact.format(value);
}

export function compactMoney(cents: number): string {
  return `${compactNumber(cents / 100)} грн`;
}

export function formatPercentage(value: number): string {
  return `${percentage.format(value)}%`;
}
