import { Badge } from '@/components/ui/badge';
import type { CrmWorkspace, WorkflowRecord } from '../api/types';
import { displayDate, overdueLabel, statusLabel } from '../lib/workflow';

interface WorkflowDetailsProps {
  target: WorkflowRecord;
  data?: CrmWorkspace;
}

/** Summary for table rows; complete planned and actual dates remain in the dialog. */
export function WorkflowDatePreview({ target }: WorkflowDetailsProps) {
  const order = target.kind === 'order' ? target.record : null;
  const overdue = overdueLabel(target);
  return (
    <div className='flex flex-col gap-1 text-xs'>
      <p>
        <span className='text-muted-foreground'>Прийом · план: </span>
        {displayDate(target.record.plannedIntakeDate)}
      </p>
      <p>
        <span className='text-muted-foreground'>Видача · план: </span>
        {displayDate(target.record.plannedDeliveryDate)}
      </p>
      {order?.actualDeliveryDate ? (
        <p>Видано: {displayDate(order.actualDeliveryDate)}</p>
      ) : order?.actualIntakeDate ? (
        <p>Прийнято: {displayDate(order.actualIntakeDate)}</p>
      ) : null}
      {overdue && (
        <Badge variant='destructive' className='max-w-full whitespace-normal'>
          {overdue}
        </Badge>
      )}
    </div>
  );
}

export function WorkflowDates({ target }: WorkflowDetailsProps) {
  const overdue = overdueLabel(target);
  const order = target.kind === 'order' ? target.record : null;
  return (
    <div className='flex flex-col gap-2 text-sm'>
      <dl className='grid grid-cols-2 gap-x-4 gap-y-1'>
        <dt className='text-muted-foreground'>Прийом · план</dt>
        <dd>{displayDate(target.record.plannedIntakeDate)}</dd>
        <dt className='text-muted-foreground'>Видача · план</dt>
        <dd>{displayDate(target.record.plannedDeliveryDate)}</dd>
        {order && (
          <>
            <dt className='text-muted-foreground'>Прийом · факт</dt>
            <dd>{displayDate(order.actualIntakeDate)}</dd>
            <dt className='text-muted-foreground'>Готовність · факт</dt>
            <dd>{displayDate(order.actualReadyDate)}</dd>
            <dt className='text-muted-foreground'>Видача · факт</dt>
            <dd>{displayDate(order.actualDeliveryDate)}</dd>
          </>
        )}
      </dl>
      {overdue && <Badge variant='destructive'>{overdue}</Badge>}
      {order?.actualIntakeDate &&
        order.plannedIntakeDate &&
        order.actualIntakeDate > order.plannedIntakeDate && (
          <Badge variant='outline'>Прийнято пізніше плану</Badge>
        )}
      {order?.actualDeliveryDate &&
        order.plannedDeliveryDate &&
        order.actualDeliveryDate > order.plannedDeliveryDate && (
          <Badge variant='outline'>Видано пізніше плану</Badge>
        )}
    </div>
  );
}

export function WorkflowHistory({ target, data }: WorkflowDetailsProps) {
  const relatedRequest = target.kind === 'order' ? target.record.requestId : null;
  const events = (data?.events ?? []).filter(
    (event) =>
      (event.kind === target.kind && event.recordId === target.record.id) ||
      (event.kind === 'request' && event.recordId === relatedRequest)
  );
  if (!events.length) return null;
  return (
    <details className='rounded-lg border p-3'>
      <summary className='cursor-pointer text-sm font-medium'>
        Історія статусів і перенесень ({events.length})
      </summary>
      <ol className='mt-3 flex flex-col gap-3'>
        {events.map((event) => (
          <li key={event.id} className='flex flex-col gap-1 text-sm'>
            <p className='font-medium'>
              {event.fromStatus ? `${statusLabel(event.fromStatus)} → ` : 'Створено · '}
              {statusLabel(event.toStatus)}
            </p>
            {event.previousIntakeDate !== event.plannedIntakeDate && (
              <p>
                Прийом: {displayDate(event.previousIntakeDate)} →{' '}
                {displayDate(event.plannedIntakeDate)}
              </p>
            )}
            {event.previousDeliveryDate !== event.plannedDeliveryDate && (
              <p>
                Видача: {displayDate(event.previousDeliveryDate)} →{' '}
                {displayDate(event.plannedDeliveryDate)}
              </p>
            )}
            {event.note && <p className='whitespace-pre-wrap'>{event.note}</p>}
            <time dateTime={event.createdAt} className='text-muted-foreground text-xs'>
              {new Intl.DateTimeFormat('uk-UA', {
                dateStyle: 'short',
                timeStyle: 'short',
                timeZone: 'Europe/Kyiv'
              }).format(new Date(event.createdAt))}
            </time>
          </li>
        ))}
      </ol>
    </details>
  );
}
