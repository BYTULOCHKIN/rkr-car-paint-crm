export class EconomicsError extends Error {}

export function integer(value: number, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new EconomicsError(`${label}: недопустиме ціле значення`);
  }
  return value;
}

export function safeNumber(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw new EconomicsError('Результат перевищує допустиму точність');
  }
  return result;
}

/** Exact intermediate arithmetic; ties round away from zero. */
export function roundedRatio(numerator: bigint, denominator: bigint): number {
  if (denominator <= BigInt(0)) throw new EconomicsError('Дільник має бути додатним');
  const magnitude = numerator < BigInt(0) ? -numerator : numerator;
  const rounded = (magnitude + denominator / BigInt(2)) / denominator;
  return safeNumber(numerator < BigInt(0) ? -rounded : rounded);
}

export function sumIntegers(values: readonly number[]): number {
  return safeNumber(
    values.reduce((sum, value) => {
      integer(value, 'Сума', -Number.MAX_SAFE_INTEGER);
      return sum + BigInt(value);
    }, BigInt(0))
  );
}
