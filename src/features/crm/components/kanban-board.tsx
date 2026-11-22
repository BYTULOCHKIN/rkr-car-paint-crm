'use client';

import { useCallback, useId, useMemo, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { useSuspenseQuery } from '@tanstack/react-query';
import { DragOverlay, type DragEndEvent, type UniqueIdentifier } from '@dnd-kit/core';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanItem,
  KanbanItemHandle
} from '@/components/ui/kanban';
import { customerContacts, contactHref, primaryContact } from '../lib/customer-contacts';
import { StatusBadge } from './status-badge';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { assigneeLabel } from '../lib/assignee';
import { crmQueries } from '../api/queries';
import type { BoardStatus, CrmWorkspace, WorkflowRecord } from '../api/types';
import { displayDate, overdueLabel, WORKFLOW_COLUMNS, transitionKind } from '../lib/workflow';
import { Button } from './action-button';
import { CrmEditorDialog, type Editor } from './editor-dialog';
import { vehicleLabel } from './format';
import { BoardViewport } from './board-viewport';

import {
  batchBoard,
  filterBoard,
  indexBoard,
  BOARD_BATCH_SIZE,
  type BoardCard,
  type BoardColumns as Columns
} from '../lib/board';
import { BoardSearch } from './board-search';

interface CrmKanbanBoardProps {
  userId: string;
  orgId?: string | null;
}

interface CardContentProps {
  card: BoardCard;
  data: CrmWorkspace;
  onOpen?: () => void;
  onStatus?: () => void;
  preview?: boolean;
  worker?: boolean;
}

function BoardCardContent({
  card,
  data,
  onOpen,
  onStatus,
  preview,
  worker
}: CardContentProps): ReactElement {
  const { target, customer, vehicle } = card;
  const overdue = overdueLabel(target);
  const label = target.kind === 'request' ? 'Заявка' : `Замовлення №${target.record.number}`;
  const customerName = customer?.name || 'Клієнта не знайдено';
  const car = vehicle ? vehicleLabel(vehicle) : 'Автомобіль не знайдено';
  return (
    <article
      data-slot='crm-board-card'
      aria-label={`${label} · ${customerName}`}
      aria-hidden={preview || undefined}
      inert={preview || undefined}
      className='bg-card text-card-foreground flex min-w-0 flex-col gap-3 rounded-lg border p-3 shadow-xs'
    >
      <div className='flex min-w-0 items-center justify-between gap-2'>
        <Badge variant='outline' className='min-w-0'>
          <span className='truncate'>{label}</span>
        </Badge>
        {!worker &&
          (preview ? (
            <span className='flex size-7 shrink-0 items-center justify-center'>
              <Icons.gripVertical className='size-4' />
            </span>
          ) : (
            <KanbanItemHandle
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                'shrink-0 touch-none'
              )}
              aria-label={`Перемістити ${label} · ${customerName}`}
            >
              <Icons.gripVertical aria-hidden />
            </KanbanItemHandle>
          ))}
      </div>
      <div className='min-w-0'>
        <h3 className='truncate text-sm font-medium' title={customerName}>
          {customerName}
        </h3>
        {primaryContact(customer) && (
          <a
            href={contactHref(
              customerContacts(customer).find((contact) => contact.type === 'phone') ??
                customerContacts(customer)[0]
            )}
            title={primaryContact(customer)}
            className='text-muted-foreground block w-fit max-w-full truncate rounded-sm text-xs underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring'
          >
            {primaryContact(customer)}
          </a>
        )}
      </div>
      <div className='min-w-0'>
        <p className='truncate text-sm' title={car}>
          {car}
        </p>
        {vehicle?.vin && (
          <p className='text-muted-foreground break-all font-mono text-xs'>{vehicle.vin}</p>
        )}
      </div>
      <p
        className='line-clamp-3 break-words whitespace-pre-wrap text-sm'
        title={target.record.description}
      >
        {target.record.description}
      </p>
      {target.kind === 'order' && (
        <p className='text-xs break-words'>
          <span className='text-muted-foreground'>Відповідальний: </span>
          {assigneeLabel(target.record, data.team)}
        </p>
      )}
      <dl className='grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 text-xs'>
        <dt className='text-muted-foreground'>Прийом · план</dt>
        <dd className='text-right tabular-nums'>{displayDate(target.record.plannedIntakeDate)}</dd>
        <dt className='text-muted-foreground'>Видача · план</dt>
        <dd className='text-right tabular-nums'>
          {displayDate(target.record.plannedDeliveryDate)}
        </dd>
        {target.kind === 'order' && (
          <>
            <dt className='text-muted-foreground'>Прийом · факт</dt>
            <dd className='text-right tabular-nums'>
              {displayDate(target.record.actualIntakeDate)}
            </dd>
          </>
        )}
        {target.kind === 'order' && target.record.actualDeliveryDate && (
          <>
            <dt className='text-muted-foreground'>Видача · факт</dt>
            <dd className='text-right tabular-nums'>
              {displayDate(target.record.actualDeliveryDate)}
            </dd>
          </>
        )}
      </dl>
      {overdue && (
        <Badge variant='destructive' className='max-w-full whitespace-normal'>
          {overdue}
        </Badge>
      )}
      <div className='grid grid-cols-2 gap-2 border-t pt-3'>
        <Button
          size='sm'
          variant='outline'
          className='h-auto min-h-8 min-w-0 px-2 py-1.5 whitespace-normal'
          onClick={onOpen}
        >
          {target.kind === 'request' ? 'Взяти в роботу' : 'Замовлення'}
        </Button>
        <Button
          size='sm'
          variant='ghost'
          className='h-auto min-h-8 min-w-0 px-2 py-1.5 whitespace-normal'
          onClick={onStatus}
        >
          {worker ? 'Оновити статус' : 'Статус і дати'}
        </Button>
      </div>
    </article>
  );
}

export function CrmKanbanBoard({ userId, orgId }: CrmKanbanBoardProps): ReactElement {
  const { data } = useSuspenseQuery(crmQueries.workspace(userId, orgId));
  const worker = data.access?.role === 'worker';
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [draft, setDraft] = useState<Columns | null>(null);
  const [draggedId, setDraggedId] = useState<UniqueIdentifier | null>(null);
  const boardId = useId();
  const [limit, setLimit] = useState(BOARD_BATCH_SIZE);
  const [searchReset, setSearchReset] = useState(0);
  const cards = useMemo(() => indexBoard(data), [data]);
  const columns = useMemo(() => filterBoard(cards, search), [cards, search]);
  const batched = useMemo(() => batchBoard(columns, limit), [columns, limit]);
  const visible = draft ?? batched;
  const draggedCard = cards.find((card) => card.id === draggedId);
  const matchCount = Object.values(columns).reduce((sum, list) => sum + list.length, 0);
  const shownCount = Object.values(batched).reduce((sum, list) => sum + list.length, 0);
  const applySearch = useCallback((value: string) => {
    setSearch(value);
    setDraft(null);
    setLimit(BOARD_BATCH_SIZE);
  }, []);

  function openOrder(target: WorkflowRecord): void {
    if (target.kind === 'order') {
      setEditor({ type: 'order', order: target.record });
      return;
    }
    const vehicle = data.vehicles.find((entry) => entry.id === target.record.vehicleId);
    if (!vehicle?.vin) {
      toast.info('Спочатку додайте VIN автомобіля');
      if (vehicle) setEditor({ type: 'vin', vehicle });
    } else setEditor({ type: 'order', request: target.record });
  }

  function finishDrag({ active, over }: DragEndEvent): void {
    setDraggedId(null);
    const card = cards.find((entry) => entry.id === active.id);
    const destination =
      over &&
      (WORKFLOW_COLUMNS.some((column) => column.value === over.id)
        ? String(over.id)
        : Object.entries(visible).find(([, list]) =>
            list.some((entry) => entry.id === over.id)
          )?.[0]);
    setDraft(null);
    if (!card || !destination || destination === card.target.record.status) return;
    const action = transitionKind(card.target, destination as BoardStatus);
    if (action === 'convert') {
      openOrder(card.target);
      return;
    }
    if (action === 'invalid') {
      toast.error('Цей перехід недоступний. Заявку спочатку потрібно взяти в роботу.');
      return;
    }
    setEditor({
      type: 'workflow',
      target: card.target,
      requestedStatus: destination as BoardStatus
    });
  }

  return (
    <div className='flex min-w-0 flex-1 flex-col gap-4'>
      <div className='flex flex-wrap items-center gap-3'>
        <BoardSearch key={searchReset} search={search} onSearch={applySearch} />
        {!worker && <Button onClick={() => setEditor({ type: 'request' })}>Нова заявка</Button>}
        {!worker && (
          <Button variant='outline' onClick={() => setEditor({ type: 'order' })}>
            Нове замовлення
          </Button>
        )}
        <p role='status' aria-live='polite' className='text-muted-foreground text-xs'>
          Знайдено {matchCount} із {cards.length}
        </p>
      </div>
      <p className='text-muted-foreground text-sm'>
        Перетягніть картку або відкрийте «Статус і дати». Зміни застосуються після збереження форми.
        <span className='hidden lg:inline'> Картки впорядковано за плановою датою.</span>
      </p>
      {search.trim() && matchCount === 0 && (
        <div className='flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm'>
          <p>За вашим пошуком записів не знайдено.</p>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => {
              applySearch('');
              setSearchReset((value) => value + 1);
            }}
          >
            Очистити пошук
          </Button>
        </div>
      )}
      <Kanban
        value={visible}
        getItemValue={(card) => card.id}
        onValueChange={(next) => {
          if (!worker) setDraft(next);
        }}
        onDragEnd={worker ? undefined : finishDrag}
        onDragStart={({ active }) => setDraggedId(active.id)}
        onDragCancel={() => {
          setDraft(null);
          setDraggedId(null);
        }}
        onMove={() => undefined}
        accessibility={{
          screenReaderInstructions: {
            draggable:
              'Натисніть пробіл або Enter, щоб підняти картку. Переміщуйте стрілками, повторно натисніть пробіл або Enter для підтвердження, Escape — для скасування.'
          }
        }}
      >
        <BoardViewport
          footer={
            <div data-slot='crm-board-footer' className='flex flex-col items-center gap-2 pt-1'>
              <p className='text-muted-foreground text-xs'>
                Показано {shownCount} із {matchCount}
              </p>
              {!draggedId && shownCount < matchCount && (
                <Button
                  size='sm'
                  variant='outline'
                  aria-controls={`${boardId}-board`}
                  onClick={() => setLimit((previous) => previous + BOARD_BATCH_SIZE)}
                >
                  <span className='inline-flex items-center gap-1 whitespace-nowrap'>
                    <Icons.chevronDown aria-hidden data-icon='inline-start' />
                    <span>Показати ще</span>
                  </span>
                </Button>
              )}
            </div>
          }
        >
          <KanbanBoard
            id={`${boardId}-board`}
            className='h-auto w-max min-w-full items-stretch gap-4'
          >
            {WORKFLOW_COLUMNS.filter(
              (column) =>
                !worker || ['created', 'in_progress', 'ready', 'delivered'].includes(column.value)
            ).map((column) => (
              <KanbanColumn
                key={column.value}
                value={column.value}
                className='h-auto w-[min(20rem,calc(100vw-3rem))] min-w-0 shrink-0 gap-0 overflow-hidden p-0'
                style={{ backgroundColor: 'var(--muted)' }}
                aria-labelledby={`${boardId}-${column.value}`}
              >
                <div
                  data-slot='crm-column-header'
                  className='flex h-14 shrink-0 items-center justify-between gap-2 border-b px-3'
                >
                  <h2 id={`${boardId}-${column.value}`} className='truncate text-sm font-semibold'>
                    <StatusBadge status={column.value} />
                  </h2>
                  <Badge
                    variant='secondary'
                    className='min-w-6 shrink-0 justify-center tabular-nums'
                  >
                    {columns[column.value]?.length ?? 0}
                  </Badge>
                </div>
                <div
                  data-slot='crm-column-body'
                  role='region'
                  aria-label={`Картки: ${column.label}`}
                  className='flex flex-1 flex-col gap-3 p-3'
                >
                  {!visible[column.value]?.length && (
                    <p className='text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm'>
                      {search.trim() ? 'Немає збігів' : 'Немає записів'}
                    </p>
                  )}
                  {visible[column.value]?.map((card) => (
                    <KanbanItem
                      key={card.id}
                      value={card.id}
                      disabled={worker}
                      className='min-w-0 shrink-0'
                    >
                      <BoardCardContent
                        worker={worker}
                        card={card}
                        data={data}
                        onOpen={() => openOrder(card.target)}
                        onStatus={() => setEditor({ type: 'workflow', target: card.target })}
                      />
                    </KanbanItem>
                  ))}
                </div>
              </KanbanColumn>
            ))}
          </KanbanBoard>
        </BoardViewport>
        {/* The template overlay ignores prevented keyboard activation events. Track the
            active card here so both keyboard and pointer drags retain the same preview. */}
        {draggedCard &&
          createPortal(
            <DragOverlay dropAnimation={null} className='cursor-grabbing'>
              <BoardCardContent card={draggedCard} data={data} preview />
            </DragOverlay>,
            document.body
          )}
      </Kanban>
      {editor && (
        <CrmEditorDialog
          editor={editor}
          data={data}
          onClose={() => setEditor(null)}
          onSelectOrder={(order) => setEditor({ type: 'order', order })}
        />
      )}
    </div>
  );
}
