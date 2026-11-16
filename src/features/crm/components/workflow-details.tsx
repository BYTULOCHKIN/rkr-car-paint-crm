import { Badge } from '@/components/ui/badge';
import type { CrmWorkspace, WorkflowRecord } from '../api/types';
import { displayDate, overdueLabel } from '../lib/workflow';

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

export { WorkflowHistory } from './workflow-history';
