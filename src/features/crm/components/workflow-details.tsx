import { TableCellPopover } from '@/components/data-table/table-cell-preview';
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
  const delivered = order?.actualDeliveryDate;
  const deadline =
    delivered || target.record.plannedDeliveryDate || target.record.plannedIntakeDate;
  return (
    <TableCellPopover
      label='План і факт'
      summary={
        <span className='flex min-w-0 flex-col text-xs'>
          <span className='truncate'>
            {delivered ? 'Видано' : target.record.plannedDeliveryDate ? 'Видача' : 'Прийом'}:{' '}
            {displayDate(deadline)}
          </span>
          {overdue ? (
            <span className='truncate font-medium text-destructive'>Прострочено</span>
          ) : (
            <span className='text-muted-foreground'>{delivered ? 'Завершено' : 'План і факт'}</span>
          )}
        </span>
      }
    >
      <WorkflowDates target={target} />
    </TableCellPopover>
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
