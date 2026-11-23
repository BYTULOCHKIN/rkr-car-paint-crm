'use client';

import { lazy, Suspense, useCallback, useState, type ReactElement } from 'react';
import type { CrmWorkspace, RepairOrder } from '@/features/crm/api/types';
import type { FormState } from '@/features/crm/components/form-status';
import { Button } from '@/features/crm/components/action-button';
import { Skeleton } from '@/components/ui/skeleton';
import { money } from '@/features/crm/lib/format';
import { workKindOptions } from '../lib/details';

const DetailedCheckForm = lazy(() => import('./detailed-check-form'));

interface OrderWorkDetailsProps {
  order: RepairOrder;
  data: CrmWorkspace;
  disabled?: boolean;
  onStateChange: (state: FormState) => void;
  onFinancialCorrection: () => void;
}

export function OrderWorkDetails({
  order,
  data,
  disabled,
  onStateChange,
  onFinancialCorrection
}: OrderWorkDetailsProps): ReactElement {
  const [editing, setEditing] = useState(false);
  const saved = useCallback(() => setEditing(false), []);
  const details = order.economics;
  const posted = data.finance?.postings.some((entry) => entry.orderId === order.id);
  const admin = data.access?.role === 'admin';
  const editable =
    admin && !posted && (order.status === 'created' || order.status === 'in_progress');
  return (
    <section
      className='flex min-w-0 flex-col gap-3 rounded-lg border p-4'
      aria-label='Деталізований чек'
    >
      <h3 className='font-semibold'>Роботи, ціни та виконавці</h3>
      {editing ? (
        <Suspense fallback={<Skeleton className='h-32 w-full' />}>
          <DetailedCheckForm
            order={order}
            orgId={data.access!.orgId}
            team={data.team ?? []}
            onSaved={saved}
            onCancel={saved}
            onStateChange={onStateChange}
            footerActions
          />
        </Suspense>
      ) : (
        <>
          {!details ? (
            <p className='text-muted-foreground text-sm'>
              Деталізуйте чек, щоб призначити виконавців і розрахувати винагороду за видами робіт.
            </p>
          ) : (
            <>
              <dl className='grid grid-cols-2 gap-2 text-sm'>
                {(['painter', 'polisher', 'assembler'] as const).map((role) => (
                  <div key={role} className='contents'>
                    <dt>
                      {
                        { painter: 'Маляр', polisher: 'Полірувальник', assembler: 'Розбірник' }[
                          role
                        ]
                      }
                    </dt>
                    <dd>{details[`${role}Name`] || 'Не призначено'}</dd>
                  </div>
                ))}
              </dl>
              <ul className='flex flex-col gap-2 text-sm'>
                {details.lines.map((line) => (
                  <li key={line.id} className='rounded-md border p-3'>
                    <div className='flex flex-wrap justify-between gap-2'>
                      <strong>{line.description}</strong>
                      <span>{money(line.unitPriceCents * line.quantity)}</span>
                    </div>
                    <p className='text-muted-foreground'>
                      {workKindOptions.find((option) => option.value === line.kind)?.label} ·{' '}
                      {line.quantity} × {money(line.unitPriceCents)}
                    </p>
                    {(line.kind === 'painting' || line.contractorName) && (
                      <details className='mt-2'>
                        <summary className='cursor-pointer'>Внутрішні суми</summary>
                        {line.kind === 'painting' && (
                          <p>Полірування у складі фарбування: {money(line.polishingCents)}</p>
                        )}
                        {line.contractorName && (
                          <p>
                            {line.contractorName} · Оплата підряднику:{' '}
                            {money(line.subcontractCostCents)}
                          </p>
                        )}
                      </details>
                    )}
                  </li>
                ))}
              </ul>
              <p className='text-right font-semibold'>Чек клієнта: {money(order.totalCents)}</p>
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
          {admin && !editable && (
            <Button
              type='button'
              variant='outline'
              className='self-start'
              disabled={disabled}
              onClick={onFinancialCorrection}
            >
              Перейти до фінансового коригування
            </Button>
          )}
        </>
      )}
    </section>
  );
}
