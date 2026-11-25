import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { StockMovement } from '../api/types';
import { movementLabels, stockQuantity } from '../lib/format';
import { money } from '@/features/crm/lib/format';

export function MovementHistory({
  movements,
  onReverse
}: {
  movements: StockMovement[];
  onReverse?: (movement: StockMovement) => void;
}) {
  if (!movements.length) return <p className='text-muted-foreground text-sm'>Операцій ще немає.</p>;
  return (
    <ol className='flex flex-col gap-3' aria-label='Історія складських операцій'>
      {movements.map((movement) => (
        <li key={movement.id} className='flex flex-col gap-2 rounded-lg border p-3 text-sm'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='outline'>{movementLabels[movement.kind]}</Badge>
              {movement.reversed && <Badge variant='secondary'>Скасовано</Badge>}
              <strong className='break-words'>{movement.itemName}</strong>
            </div>
            <span className='font-medium tabular-nums'>
              {movement.accountingMode === 'amount' ? (
                'За сумою'
              ) : movement.kind === 'valuation' ? (
                'Кількість не змінена'
              ) : (
                <>
                  {movement.deltaMilli > 0 ? '+' : ''}
                  {stockQuantity(movement.deltaMilli)} {movement.unit}
                </>
              )}
            </span>
          </div>
          {movement.kind === 'valuation' ? (
            <p>
              Вартість залишку: {money(movement.valuationTotalCents!)}. Історичні списання не
              переоцінені.
            </p>
          ) : (
            <p>
              Вартість операції:{' '}
              {movement.costDeltaCents === null ? 'Не визначена' : money(movement.costDeltaCents)}
              {movement.category &&
                ` · ${movement.category === 'painting' ? 'Малярні роботи' : 'Полірування'}`}
            </p>
          )}
          {movement.currency &&
            movement.purchaseAmountMinor !== null &&
            movement.exchangeRateMicros !== null && (
              <p className='text-muted-foreground'>
                Закупівля: {(movement.purchaseAmountMinor / 100).toFixed(2)} {movement.currency}
                {movement.currency === 'EUR' &&
                  ` · Курс: ${movement.exchangeRateMicros / 1000000} грн/€`}
              </p>
            )}
          <p className='text-muted-foreground'>
            {new Intl.DateTimeFormat('uk-UA', {
              dateStyle: 'short',
              timeStyle: 'short',
              timeZone: 'Europe/Kyiv'
            }).format(new Date(movement.createdAt))}
            {' · '}
            {movement.actor.name}
            {movement.orderNumber !== null ? ` · Замовлення №${movement.orderNumber}` : ''}
          </p>
          {movement.note && <p className='break-words whitespace-pre-wrap'>{movement.note}</p>}
          {onReverse &&
            movement.kind === 'consumption' &&
            !movement.reversed &&
            !movement.financialLocked && (
              <Button
                variant='outline'
                size='sm'
                className='self-start'
                onClick={() => onReverse(movement)}
              >
                Скасувати списання
              </Button>
            )}
        </li>
      ))}
    </ol>
  );
}
