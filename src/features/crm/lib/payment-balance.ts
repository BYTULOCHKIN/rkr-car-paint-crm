import type { PaymentEvent, RepairOrder } from '../api/types';

export function paymentBalance(
  order: Pick<RepairOrder, 'id' | 'totalCents'>,
  payments: PaymentEvent[] = []
) {
  const paidCents = payments
    .filter((payment) => payment.orderId === order.id)
    .reduce(
      (sum, payment) =>
        sum + (payment.kind === 'payment' ? payment.amountCents : -payment.amountCents),
      0
    );
  const remainingCents = Math.max(0, order.totalCents - paidCents);
  return {
    paidCents,
    remainingCents,
    status: remainingCents === 0 ? 'Оплачено' : paidCents > 0 ? 'Частково оплачено' : 'Не оплачено'
  };
}
