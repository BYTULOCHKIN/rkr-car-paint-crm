'use client';

/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- Named scroll regions need focus for native keyboard scrolling. */

import { useId, useMemo, useState, type ReactElement } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { crmQueries } from '../api/queries';
import type { BoardStatus, CrmWorkspace, WorkflowRecord } from '../api/types';
import {
  boardRecords,
  displayDate,
  overdueLabel,
  WORKFLOW_COLUMNS,
  transitionKind
} from '../lib/workflow';
import { Button } from './action-button';
import { CrmEditorDialog, type Editor } from './editor-dialog';
import { SummaryCards } from './summary-cards';
import { vehicleLabel } from './format';
import { BoardViewport } from './board-viewport';

interface BoardCard {
  id: string;
  target: WorkflowRecord;
}
type Columns = Record<UniqueIdentifier, BoardCard[]>;
interface CrmKanbanBoardProps {
  userId: string;
}

function plannedCardDate(card: BoardCard): string {
  return (
    (card.target.kind === 'request'
      ? card.target.record.plannedIntakeDate
      : card.target.record.plannedDeliveryDate) || '9999'
  );
}

interface CardContentProps {
  card: BoardCard;
  data: CrmWorkspace;
  onOpen?: () => void;
  onStatus?: () => void;
  preview?: boolean;
}

function BoardCardContent({
  card,
  data,
  onOpen,
  onStatus,
  preview
}: CardContentProps): ReactElement {
  const { target } = card;
  const customer = data.customers.find((entry) => entry.id === target.record.customerId);
  const vehicle = data.vehicles.find((entry) => entry.id === target.record.vehicleId);
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
        {preview ? (
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
        )}
      </div>
      <div className='min-w-0'>
        <h3 className='truncate text-sm font-medium' title={customerName}>
          {customerName}
        </h3>
        {customer?.phone && (
          <a
            href={`tel:${customer.phone}`}
            title={customer.phone}
            className='text-muted-foreground block w-fit max-w-full truncate rounded-sm text-xs underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring'
          >
            {customer.phone}
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
          Статус і дати
        </Button>
      </div>
    </article>
  );
}

export function CrmKanbanBoard({ userId }: CrmKanbanBoardProps): ReactElement {
  const { data } = useSuspenseQuery(crmQueries.workspace(userId));
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [draft, setDraft] = useState<Columns | null>(null);
  const [draggedId, setDraggedId] = useState<UniqueIdentifier | null>(null);
  const boardId = useId();
  const cards = useMemo(
    () =>
      boardRecords(data).map((target) => ({ id: `${target.kind}:${target.record.id}`, target })),
    [data]
  );
  const columns = useMemo(() => {
    const result: Columns = Object.fromEntries(
      WORKFLOW_COLUMNS.map((column) => [column.value, []])
    );
    const query = search.trim().toLocaleLowerCase('uk-UA');
    for (const card of cards) {
      const customer = data.customers.find((entry) => entry.id === card.target.record.customerId);
      const vehicle = data.vehicles.find((entry) => entry.id === card.target.record.vehicleId);
      const label = [
        customer?.name,
        customer?.phone,
        vehicle?.vin,
        vehicle?.plate,
        vehicle?.make,
        vehicle?.model,
        card.target.record.description,
        card.target.kind === 'order' ? card.target.record.number : ''
      ]
        .join(' ')
        .toLocaleLowerCase('uk-UA');
      if (query && !label.includes(query)) continue;
      result[card.target.record.status]?.push(card);
    }
    for (const [key, list] of Object.entries(result))
      result[key] = list.toSorted((a, b) => {
        return (
          plannedCardDate(a).localeCompare(plannedCardDate(b)) ||
          a.target.record.createdAt.localeCompare(b.target.record.createdAt)
        );
      });
    return result;
  }, [cards, data.customers, data.vehicles, search]);
  const visible = draft ?? columns;
  const draggedCard = cards.find((card) => card.id === draggedId);
  const visibleCount = Object.values(visible).reduce((sum, list) => sum + list.length, 0);

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
      <SummaryCards data={data} compactOnMobile />
      <div className='flex flex-wrap items-center gap-3'>
        <Input
          className='w-full sm:max-w-sm'
          aria-label='Пошук на дошці'
          type='search'
          autoComplete='off'
          placeholder='Клієнт, автомобіль, VIN…'
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setDraft(null);
          }}
        />
        <Button onClick={() => setEditor({ type: 'request' })}>Нова заявка</Button>
        <Button variant='outline' onClick={() => setEditor({ type: 'order' })}>
          Нове замовлення
        </Button>
        <p role='status' aria-live='polite' className='text-muted-foreground text-xs'>
          Показано {visibleCount} із {cards.length}
        </p>
      </div>
      <p className='text-muted-foreground text-sm'>
        Перетягніть картку або відкрийте «Статус і дати». Зміни застосуються після збереження форми.
        <span className='hidden lg:inline'> Картки впорядковано за плановою датою.</span>
      </p>
      {search.trim() && visibleCount === 0 && (
        <div className='flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm'>
          <p>За вашим пошуком записів не знайдено.</p>
          <Button
            size='sm'
            variant='ghost'
            onClick={() => {
              setSearch('');
              setDraft(null);
            }}
          >
            Очистити пошук
          </Button>
        </div>
      )}
      <Kanban
        value={visible}
        getItemValue={(card) => card.id}
        onValueChange={setDraft}
        onDragEnd={finishDrag}
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
        <BoardViewport>
          <KanbanBoard className='h-full w-max min-w-full items-stretch gap-4'>
            {WORKFLOW_COLUMNS.map((column) => (
              <KanbanColumn
                key={column.value}
                value={column.value}
                className='h-full w-[min(20rem,calc(100vw-3rem))] min-w-0 shrink-0 gap-0 overflow-hidden p-0'
                style={{ backgroundColor: 'var(--muted)' }}
                aria-labelledby={`${boardId}-${column.value}`}
              >
                <div
                  data-slot='crm-column-header'
                  className='flex h-14 shrink-0 items-center justify-between gap-2 border-b px-3'
                >
                  <h2 id={`${boardId}-${column.value}`} className='truncate text-sm font-semibold'>
                    {column.label}
                  </h2>
                  <Badge
                    variant='secondary'
                    className='min-w-6 shrink-0 justify-center tabular-nums'
                  >
                    {visible[column.value]?.length ?? 0}
                  </Badge>
                </div>
                <div
                  data-slot='crm-column-body'
                  role='region'
                  aria-label={`Картки: ${column.label}`}
                  tabIndex={0}
                  className='flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-y-contain p-3 outline-none [scrollbar-gutter:stable] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
                >
                  {!visible[column.value]?.length && (
                    <p className='text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm'>
                      {search.trim() ? 'Немає збігів' : 'Немає записів'}
                    </p>
                  )}
                  {visible[column.value]?.map((card) => (
                    <KanbanItem key={card.id} value={card.id} className='min-w-0 shrink-0'>
                      <BoardCardContent
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
