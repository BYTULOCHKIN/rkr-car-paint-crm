import type { PaymentEvent, RepairOrder } from '../api/types';
import { sumIntegers } from '@/features/order-economics/lib/integers';

export function paymentDelta(payment: PaymentEvent): number {
  return payment.kind === 'payment' || payment.kind === 'refund_reversal'
    ? payment.amountCents
    : -payment.amountCents;
}

export function paymentBalance(
  order: Pick<RepairOrder, 'id' | 'totalCents'>,
  payments: PaymentEvent[] = []
) {
  const paidCents = sumIntegers(
    payments.filter((payment) => payment.orderId === order.id).map(paymentDelta)
  );
  const remainingCents = Math.max(0, order.totalCents - paidCents);
  return {
    paidCents,
    remainingCents,
    overpaidCents: Math.max(0, paidCents - order.totalCents),
    status:
      paidCents > order.totalCents
        ? 'Переплата'
        : remainingCents === 0
          ? 'Оплачено'
          : paidCents > 0
            ? 'Частково оплачено'
            : 'Не оплачено'
  };
}
