import type { PurchaseValuationInput, StockValuation, ValuedConsumption } from '../api/types';
import { EconomicsError, integer, roundedRatio, sumIntegers } from './integers';

function validateBalance(balance: StockValuation): void {
  integer(balance.quantityMilli, 'Кількість залишку');
  integer(balance.totalCostCents, 'Вартість залишку');
  if (balance.quantityMilli === 0 && balance.totalCostCents !== 0) {
    throw new EconomicsError('Нульовий залишок не може мати вартість');
  }
}

export function valuePurchase(input: PurchaseValuationInput): number {
  integer(input.amountMinor, 'Сума закупівлі');
  integer(input.exchangeRateMicros, 'Курс', 1);
  if (input.currency !== 'UAH' && input.currency !== 'EUR') {
    throw new EconomicsError('Валюта закупівлі має бути UAH або EUR');
  }
  if (input.currency === 'UAH' && input.exchangeRateMicros !== 1000000) {
    throw new EconomicsError('Курс гривневої закупівлі має дорівнювати 1');
  }
  return roundedRatio(
    BigInt(input.amountMinor) * BigInt(input.exchangeRateMicros),
    BigInt(1000000)
  );
}

/** Also restores a reversed consumption using its ORIGINAL quantity and cost. */
export function receiveValuedStock(
  balance: StockValuation,
  quantityMilli: number,
  costCents: number
): StockValuation {
  validateBalance(balance);
  integer(quantityMilli, 'Кількість надходження', 1);
  integer(costCents, 'Вартість надходження');
  return {
    quantityMilli: sumIntegers([balance.quantityMilli, quantityMilli]),
    totalCostCents: sumIntegers([balance.totalCostCents, costCents])
  };
}

export function consumeValuedStock(
  balance: StockValuation,
  quantityMilli: number
): ValuedConsumption {
  validateBalance(balance);
  integer(quantityMilli, 'Кількість списання', 1);
  if (quantityMilli > balance.quantityMilli) {
    throw new EconomicsError('Недостатньо матеріалу на складі');
  }
  const costCents = roundedRatio(
    BigInt(balance.totalCostCents) * BigInt(quantityMilli),
    BigInt(balance.quantityMilli)
  );
  return {
    quantityMilli,
    costCents,
    balance: {
      quantityMilli: balance.quantityMilli - quantityMilli,
      totalCostCents: balance.totalCostCents - costCents
    }
  };
}
