'use client';

import { lazy, Suspense } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { CrmWorkspace, RepairOrder } from '@/features/crm/api/types';
import type { FormState } from '@/features/crm/components/form-status';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { inventoryQueries } from '@/features/inventory/api/queries';
import { orderMaterialCosts } from '@/features/inventory/lib/order-costs';
import { money } from '@/features/crm/lib/format';
import { previewDetailedEconomics } from '../lib/details';

const SettlementPanel = lazy(() => import('./settlement-panel'));
interface EconomicsPanelProps {
  order: RepairOrder;
  data: CrmWorkspace;
  disabled?: boolean;
  onSaved: () => void;
  onStateChange?: (state: FormState) => void;
}
function EconomicsPanel({ order, data, disabled, onSaved, onStateChange }: EconomicsPanelProps) {
  const access = data.access!;
  const { data: inventory } = useSuspenseQuery(
    inventoryQueries.workspace(access.userId, access.orgId)
  );
  const posted = data.finance?.postings.filter((entry) => entry.orderId === order.id).at(-1);
  const details = order.economics;
  const preview = posted
    ? { result: posted.result, issues: [] }
    : details
      ? previewDetailedEconomics(details, orderMaterialCosts(inventory.movements, order.id))
      : null;
  return (
    <section
      className='flex min-w-0 flex-col gap-3 rounded-lg border p-4'
      aria-label='Економіка замовлення'
    >
      <h3 className='font-semibold'>Економіка замовлення</h3>
      {!details ? (
        <p className='text-muted-foreground text-sm'>
          Деталізуйте чек на вкладці «Роботи», щоб розрахувати економіку авто.
        </p>
      ) : (
        <>
          <p className='text-muted-foreground text-sm'>
            {posted
              ? `Проведений розрахунок · версія ${posted.revision} · ставка ${posted.details.employeeShareBps / 100}%`
              : `Попередній розрахунок · ставка ${details.employeeShareBps / 100}%. Нарахування виникають при готовності авто.`}
          </p>
          {preview?.issues.map((issue) => (
            <Alert key={issue}>
              <AlertDescription>{issue}</AlertDescription>
            </Alert>
          ))}
          {preview?.result && (
            <dl className='grid grid-cols-2 gap-2 text-sm'>
              {(
                [
                  ['Чек клієнта', preview.result.checkCents],
                  ['Матеріали', preview.result.materialsCents],
                  [
                    posted ? 'Маляру (нараховано)' : 'Маляру (попередньо)',
                    preview.result.painterAccrualCents
                  ],
                  [
                    posted ? 'Полірувальнику (нараховано)' : 'Полірувальнику (попередньо)',
                    preview.result.polisherAccrualCents
                  ],
                  [
                    posted ? 'Розбірнику (нараховано)' : 'Розбірнику (попередньо)',
                    preview.result.assemblerAccrualCents
                  ],
                  ['Субпідряд', preview.result.subcontractCostsCents],
                  ['Залишок автомалярки', preview.result.workshopRemainderCents]
                ] as const
              ).map(([label, amount]) => (
                <div key={label} className='contents'>
                  <dt>{label}</dt>
                  <dd className='text-right font-medium tabular-nums'>{money(amount)}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
      {data.finance && (
        <Suspense fallback={<Skeleton className='h-24 w-full' />}>
          <SettlementPanel
            order={order}
            data={data}
            disabled={disabled}
            onSaved={onSaved}
            onStateChange={onStateChange}
          />
        </Suspense>
      )}
    </section>
  );
}
export function OrderEconomicsPanel(props: EconomicsPanelProps) {
  return (
    <Suspense fallback={<Skeleton className='h-24 w-full' />}>
      <EconomicsPanel {...props} />
    </Suspense>
  );
}
