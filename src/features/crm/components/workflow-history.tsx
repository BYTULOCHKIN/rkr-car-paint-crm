'use client';

import { useState, type ReactElement } from 'react';
import { StatusBadge } from './status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import type { CrmWorkspace, WorkflowRecord, WorkflowEvent } from '../api/types';
import { displayDate } from '../lib/workflow';
import {
  historyOrderChanges,
  historyDateChanges,
  historyEventTitle,
  historyTimestamp,
  workflowHistory
} from '../lib/workflow-history';

interface WorkflowHistoryProps {
  target: WorkflowRecord;
  data?: CrmWorkspace;
}

function HistoryEvent({ event }: { event: WorkflowEvent }): ReactElement {
  const changes = historyDateChanges(event);
  const contentChanges = historyOrderChanges(event);
  const statusChanged = event.fromStatus !== event.toStatus;
  const Icon = !event.fromStatus
    ? Icons.add
    : statusChanged
      ? Icons.check
      : changes.length
        ? Icons.calendar
        : contentChanges.length
          ? Icons.edit
          : Icons.chat;
  return (
    <li className='relative min-w-0 pb-5 pl-7 last:pb-0'>
      <span className='absolute -left-3 top-3 flex size-6 items-center justify-center rounded-full border bg-background text-muted-foreground'>
        <Icon className='size-3.5' aria-hidden />
      </span>
      <article className='flex min-w-0 flex-col gap-3 rounded-xl border bg-background p-3 sm:p-4'>
        <header className='flex flex-wrap items-center justify-between gap-x-3 gap-y-2'>
          <Badge variant='outline'>{event.kind === 'request' ? 'Заявка' : 'Замовлення'}</Badge>
          {event.actor && (
            <span className='min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]'>
              Змінив: {event.actor.name}
            </span>
          )}
          <time
            dateTime={Number.isFinite(Date.parse(event.createdAt)) ? event.createdAt : undefined}
            className='text-xs tabular-nums text-muted-foreground'
          >
            {historyTimestamp(event.createdAt)}
          </time>
        </header>
        <div className='flex flex-col gap-2'>
          <h4 className='text-sm font-semibold'>{historyEventTitle(event)}</h4>
          <div className='flex flex-wrap items-center gap-2 text-xs' aria-label='Статус'>
            {event.fromStatus && event.fromStatus !== event.toStatus && (
              <>
                <StatusBadge status={event.fromStatus} />
                <span aria-label='змінено на'>→</span>
              </>
            )}
            <StatusBadge status={event.toStatus} />
          </div>
        </div>
        {changes.length > 0 && (
          <dl className='divide-y rounded-lg border px-3'>
            {changes.map((change) => (
              <div key={change.label} className='grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 py-2.5'>
                <dt className='col-span-2 text-xs font-medium'>{change.label}</dt>
                <dd className='min-w-0 text-sm tabular-nums text-muted-foreground'>
                  <span className='mb-0.5 block text-[11px]'>Було</span>
                  {change.before ? displayDate(change.before) : 'Не вказано'}
                </dd>
                <dd className='min-w-0 text-sm font-medium tabular-nums'>
                  <span className='mb-0.5 block text-[11px] font-normal text-muted-foreground'>
                    Стало
                  </span>
                  {change.after ? displayDate(change.after) : 'Дату прибрано'}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {contentChanges.length > 0 && (
          <dl className='divide-y rounded-lg border px-3'>
            {contentChanges.map((change) => (
              <div
                key={change.label}
                className='grid min-w-0 grid-cols-1 gap-3 py-3 sm:grid-cols-2'
              >
                <dt className='text-xs font-medium sm:col-span-2'>{change.label}</dt>
                <dd className='min-w-0 text-sm whitespace-pre-wrap [overflow-wrap:anywhere] text-muted-foreground'>
                  <span className='mb-1 block text-[11px]'>Було</span>
                  {change.before || 'Не вказано'}
                </dd>
                <dd className='min-w-0 text-sm font-medium whitespace-pre-wrap [overflow-wrap:anywhere]'>
                  <span className='mb-1 block text-[11px] font-normal text-muted-foreground'>
                    Стало
                  </span>
                  {change.after || 'Не вказано'}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {event.note && (
          <div className='min-w-0 rounded-lg border-l-2 bg-muted/40 p-3'>
            <p className='mb-1 text-xs font-medium text-muted-foreground'>Примітка / причина</p>
            <p className='text-sm whitespace-pre-wrap [overflow-wrap:anywhere]'>{event.note}</p>
          </div>
        )}
      </article>
    </li>
  );
}

export function WorkflowHistory({ target, data }: WorkflowHistoryProps): ReactElement {
  const [limit, setLimit] = useState(5);
  const events = workflowHistory(target, data?.events ?? []);
  return (
    <details open className='group/history min-w-0 rounded-xl border bg-muted/20'>
      <summary className='flex cursor-pointer list-none items-center gap-2 rounded-xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden'>
        <Icons.clock className='size-4 shrink-0 text-muted-foreground' aria-hidden />
        <h3 className='min-w-0 flex-1 text-sm font-semibold'>Історія змін</h3>
        <Badge variant='secondary'>{events.length}</Badge>
        <Icons.chevronDown
          className='size-4 shrink-0 text-muted-foreground group-open/history:rotate-180'
          aria-hidden
        />
      </summary>
      <div className='flex min-w-0 flex-col gap-4 border-t p-4'>
        {events.length ? (
          <>
            <div className='flex flex-wrap justify-between gap-2 text-xs text-muted-foreground'>
              <p>Спочатку новіші події</p>
              <p>Час за Києвом</p>
            </div>
            {events.some((event) => event.actualDateChanges == null) && (
              <p className='text-xs text-muted-foreground'>
                У старих подіях зміни фактичних дат можуть бути записані в примітках.
              </p>
            )}
            <ol className='ml-3 min-w-0 border-l' aria-label='Події статусів і дат'>
              {events.slice(0, limit).map((event) => (
                <HistoryEvent key={event.id} event={event} />
              ))}
            </ol>
            {events.length > 5 && (
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <p className='text-xs text-muted-foreground' aria-live='polite'>
                  Показано {Math.min(limit, events.length)} із {events.length}
                </p>
                {limit < events.length ? (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => setLimit((current) => current + 10)}
                  >
                    Показати ще
                  </Button>
                ) : (
                  <Button type='button' variant='ghost' size='sm' onClick={() => setLimit(5)}>
                    Згорнути до останніх 5
                  </Button>
                )}
              </div>
            )}
          </>
        ) : (
          <p className='text-sm text-muted-foreground'>
            Збережених подій поки немає. Старі записи можуть не мати історії; нові зміни замовлення
            з’являться тут.
          </p>
        )}
      </div>
    </details>
  );
}
