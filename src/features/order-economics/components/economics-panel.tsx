'use client';

import { lazy, Suspense, useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { CrmWorkspace, RepairOrder } from '@/features/crm/api/types';
import type { FormState } from '@/features/crm/components/form-status';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { inventoryQueries } from '@/features/inventory/api/queries';
import { orderMaterialCosts } from '@/features/inventory/lib/order-costs';
import { money } from '@/features/crm/lib/format';
import { previewDetailedEconomics, workKindOptions } from '../lib/details';

const DetailedCheckForm = lazy(() => import('./detailed-check-form'));

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
  const [editing, setEditing] = useState(false);
  const details = order.economics;
  const preview = details
    ? previewDetailedEconomics(details, orderMaterialCosts(inventory.movements, order.id))
    : null;
  const editable =
    access.role === 'admin' && (order.status === 'created' || order.status === 'in_progress');
  return (
    <section
      className='flex min-w-0 flex-col gap-3 rounded-lg border p-4'
      aria-label='Економіка замовлення'
    >
      <h3 className='font-semibold'>Деталізований чек та економіка</h3>
      {editing ? (
        <Suspense fallback={<Skeleton className='h-32 w-full' />}>
          <DetailedCheckForm
            order={order}
            orgId={access.orgId}
            team={data.team ?? []}
            onSaved={onSaved}
            onCancel={() => setEditing(false)}
            onStateChange={onStateChange}
          />
        </Suspense>
      ) : (
        <>
          {!details ? (
            <p className='text-muted-foreground text-sm'>
              Чек ще не деталізовано. Класифікуйте роботи та вкажіть виконавців для попереднього
              розрахунку.
            </p>
          ) : (
            <>
              <p className='text-muted-foreground text-sm'>
                Попередній розрахунок · ставка {details.employeeShareBps / 100}%. Нарахування та
                виплати ще не проведені.
              </p>
              {(['painter', 'polisher', 'assembler'] as const).map((role) => (
                <p key={role} className='text-sm'>
                  {{ painter: 'Маляр', polisher: 'Полірувальник', assembler: 'Розбірник' }[role]}:{' '}
                  {details[`${role}Name`] || 'Не призначено'}
                </p>
              ))}
              <ul className='flex flex-col gap-2 text-sm'>
                {details.lines.map((line) => (
                  <li key={line.id}>
                    <strong>{line.description}</strong> ·{' '}
                    {workKindOptions.find((option) => option.value === line.kind)?.label} ·{' '}
                    {money(line.unitPriceCents * line.quantity)}
                    {line.kind === 'painting' && (
                      <p className='text-muted-foreground'>
                        Внутрішня частина полірування: {money(line.polishingCents)}
                      </p>
                    )}
                    {line.contractorName && (
                      <p className='text-muted-foreground'>
                        {line.contractorName} · Оплата підряднику:{' '}
                        {money(line.subcontractCostCents)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
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
                      ['Маляру (попередньо)', preview.result.painterAccrualCents],
                      ['Полірувальнику (попередньо)', preview.result.polisherAccrualCents],
                      ['Розбірнику (попередньо)', preview.result.assemblerAccrualCents],
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
          {editable && (
            <Button
              type='button'
              variant='outline'
              className='self-start'
              disabled={disabled}
              onClick={() => setEditing(true)}
            >
              {details ? 'Редагувати деталізований чек' : 'Деталізувати чек'}
            </Button>
          )}
          {!editable && access.role === 'admin' && (
            <p className='text-muted-foreground text-sm'>
              Завершене замовлення доступне для перегляду. Фінансові виправлення потребують
              коригування.
            </p>
          )}
        </>
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
