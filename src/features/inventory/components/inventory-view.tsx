'use client';
import { OverflowText } from '@/components/data-table/table-cell-preview';
import { Icons } from '@/components/icons';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

import { startTransition, useCallback, useMemo, useState } from 'react';
import { useQuery, useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  parseAsInteger,
  parseAsBoolean,
  parseAsString,
  parseAsStringLiteral,
  parseAsArrayOf,
  useQueryState
} from 'nuqs';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { InventorySearch } from './inventory-search';
import { StockItemTags } from './stock-item-tags';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/animated-dialog';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell
} from '@/components/ui/table';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { inventoryQueries, inventoryMutations } from '../api/queries';
import type { StockItem, StockMovement } from '../api/types';
import { stockItemValues } from '../lib/item-display';
import { useInventoryLayout } from '../lib/use-inventory-layout';
import { StockItemCards } from './stock-item-cards';
import { StockItemSummary } from './stock-item-summary';
import { StockItemAvailability } from './stock-item-availability';
import { StockTagBadge } from './tag-badge';
import { StockItemActions, type StockItemAction } from './stock-item-actions';
import {
  StockItemForm,
  StockOperationForm,
  StockReversalForm,
  StockValuationForm
} from './stock-forms';
import { PagedMovements } from './paged-movements';
import { ListPagination } from '@/features/crm/components/list-pagination';
import { getInventoryExport } from '../api/search-service';
import { StockTagFilterControl } from './tag-filter';
import { stockTags } from '../constants/tags';
import { InventoryExportButton } from './inventory-export-button';
import { DeleteStockItem } from './delete-stock-item';

const tagParser = parseAsArrayOf(parseAsStringLiteral(stockTags))
  .withDefault([])
  .withOptions({ shallow: true });

type Editor =
  | { kind: 'create' }
  | {
      kind: StockItemAction;
      item: StockItem;
    }
  | { kind: 'reversal'; movement: StockMovement };

export function InventoryView({ userId, orgId }: { userId: string; orgId: string }) {
  const { data } = useSuspenseQuery(inventoryQueries.access(userId, orgId));
  const admin = data.access.role === 'admin';
  const [layout, setLayout] = useInventoryLayout(userId, orgId);
  const [tab, setTab] = useQueryState(
    'stockTab',
    parseAsStringLiteral(['materials', 'operations'])
      .withDefault('materials')
      .withOptions({ shallow: true })
  );
  const [tagValues, setTag] = useQueryState('stockTag', tagParser);
  const tags = useMemo(() => [...new Set(tagValues)], [tagValues]);
  const [search, setSearch] = useQueryState(
    'stockSearch',
    parseAsString.withDefault('').withOptions({ shallow: true })
  );
  const [page, setPage] = useQueryState(
    'stockPage',
    parseAsInteger.withDefault(1).withOptions({ shallow: true })
  );
  const [typing, setTyping] = useState(false);
  const [searchReset, setSearchReset] = useState(0);
  const onSearchPending = useCallback(
    (value: boolean) => startTransition(() => setTyping(value)),
    []
  );
  const [archived, setArchived] = useQueryState(
    'stockArchived',
    parseAsBoolean.withDefault(false).withOptions({ shallow: true })
  );
  const [editor, commitEditor] = useState<Editor | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  function setEditor(next: Editor | null): void {
    if (next) commitEditor(next);
    setDialogOpen(!!next);
  }
  const [pending, setPending] = useState(false);
  const client = useQueryClient();
  const archive = useMutation({
    ...inventoryMutations.archive(orgId),
    onSuccess: () => {
      toast.success('Збережено');
      if (editor?.kind === 'details') setEditor(null);
    },
    onError: (error) => toast.error(error.message),
    onSettled: () => client.invalidateQueries({ queryKey: inventoryQueries.all() })
  });
  const result = useQuery({
    ...inventoryQueries.items(userId, orgId, { search, tags, archived, page: Math.max(1, page) }),
    enabled: tab === 'materials'
  });
  const items = result.data?.items ?? [];
  const searchPending = typing || result.isFetching;
  const filtered = typing || search.trim() !== '' || tags.length > 0;
  function renderItemActions(item: StockItem, current?: StockItemAction) {
    return (
      <StockItemActions
        item={item}
        admin={admin}
        archivePending={archive.isPending}
        current={current}
        onAction={(kind, value) => setEditor({ kind, item: value })}
        onArchive={(value) => archive.mutate({ id: value.id, archived: !value.archived })}
      />
    );
  }
  return (
    <div className='flex min-w-0 flex-col gap-5'>
      <Tabs
        value={tab}
        onValueChange={(value) => void setTab(value as typeof tab)}
        className='min-w-0 gap-5'
      >
        <TabsList aria-label='Розділи складу' className='w-full sm:w-fit'>
          <TabsTrigger value='materials'>Матеріали</TabsTrigger>
          <TabsTrigger value='operations'>Останні операції</TabsTrigger>
        </TabsList>
        <TabsContent
          value='materials'
          className='min-w-0 space-y-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200'
        >
          <div className='flex flex-wrap items-center gap-2'>
            <InventorySearch
              key={`${orgId}:${searchReset}`}
              search={search}
              fetching={result.isFetching}
              onSearch={(value) => {
                void setSearch(value);
                void setPage(1);
              }}
              onPendingChange={onSearchPending}
            />
            <StockTagFilterControl
              value={tags}
              onChange={(value) => {
                void setTag(value);
                void setPage(1);
              }}
            />
            <Button
              variant='outline'
              onClick={() => {
                void setArchived(!archived);
                void setPage(1);
              }}
            >
              {archived ? 'Показати активні' : 'Показати архів'}
            </Button>
            {admin && <Button onClick={() => setEditor({ kind: 'create' })}>Нова позиція</Button>}
            <ToggleGroup
              aria-label='Вигляд складу'
              value={[layout]}
              onValueChange={(values) => {
                if (values[0] === 'table' || values[0] === 'cards') setLayout(values[0]);
              }}
              variant='outline'
              spacing={0}
            >
              <ToggleGroupItem value='table' aria-label='Вигляд таблицею'>
                <Icons.table aria-hidden />
                Таблиця
              </ToggleGroupItem>
              <ToggleGroupItem value='cards' aria-label='Вигляд картками'>
                <Icons.grid aria-hidden />
                Картки
              </ToggleGroupItem>
            </ToggleGroup>
            <InventoryExportButton
              items={items}
              archived={archived}
              loadItems={() => getInventoryExport(orgId, { search, tags, archived })}
              disabled={searchPending || result.isError}
            />
          </div>
          <div className='flex flex-wrap items-center gap-3 text-sm'>
            <p className='text-muted-foreground' role='status'>
              {searchPending ? 'Пошук…' : `Знайдено позицій: ${result.data?.total ?? 0}`}
            </p>
            {filtered && (
              <Button
                variant='ghost'
                size='sm'
                onClick={() => {
                  void setSearch('');
                  void setPage(1);
                  void setTag([]);
                  setTyping(false);
                  setSearchReset((value) => value + 1);
                }}
              >
                Скинути пошук і теги
              </Button>
            )}
          </div>
          {!admin && (
            <p className='text-muted-foreground text-sm'>
              Склад доступний для перегляду. Операції проводить адміністратор.
            </p>
          )}
          {result.isError ? (
            <div role='alert' className='flex items-center gap-2 text-sm'>
              Не вдалося завантажити матеріали.
              <Button variant='outline' size='sm' onClick={() => void result.refetch()}>
                Повторити
              </Button>
            </div>
          ) : result.isPending ? (
            <p role='status' className='text-muted-foreground text-sm'>
              Завантажуємо матеріали…
            </p>
          ) : items.length ? (
            layout === 'cards' ? (
              <StockItemCards
                items={items}
                actions={renderItemActions}
                onDetails={(item) => setEditor({ kind: 'details', item })}
              />
            ) : (
              <Table className='[&_td]:py-1.5'>
                <TableHeader>
                  <TableRow>
                    <TableHead>Позиція</TableHead>
                    <TableHead>Теги</TableHead>
                    <TableHead>Залишок</TableHead>
                    <TableHead>Вартість залишку</TableHead>
                    <TableHead>Середня за одиницю</TableHead>
                    <TableHead>Дії</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const values = stockItemValues(item);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <OverflowText text={item.name} className='max-w-xs font-medium' />
                          {item.notes && (
                            <OverflowText
                              text={item.notes}
                              className='text-muted-foreground max-w-xs text-xs'
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <StockItemTags tags={item.tags} itemName={item.name} />
                        </TableCell>
                        <TableCell className='tabular-nums'>{values.balance}</TableCell>
                        <TableCell className='tabular-nums'>{values.totalCost}</TableCell>
                        <TableCell className='tabular-nums'>{values.unitCost}</TableCell>
                        <TableCell>{renderItemActions(item)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Позицій не знайдено</EmptyTitle>
                <EmptyDescription>
                  {filtered
                    ? 'Змініть пошуковий запит або тег, щоб знайти потрібний матеріал.'
                    : archived
                      ? 'В архіві немає відповідних позицій.'
                      : 'Створіть позицію, потім додайте перше надходження.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {result.data && (
            <ListPagination
              {...result.data}
              pending={searchPending}
              onPage={(value) => void setPage(value)}
            />
          )}
        </TabsContent>
        <TabsContent
          value='operations'
          className='min-w-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200'
        >
          <section className='flex flex-col gap-3'>
            <h2 className='text-lg font-semibold'>Останні операції</h2>
            <PagedMovements
              userId={userId}
              orgId={orgId}
              onReverse={
                admin ? (movement) => setEditor({ kind: 'reversal', movement }) : undefined
              }
            />
          </section>
        </TabsContent>
      </Tabs>
      <Dialog
        open={dialogOpen}
        onOpenChangeComplete={(open) => {
          if (!open) commitEditor(null);
        }}
        onOpenChange={(open) => {
          if (!open && !pending) setEditor(null);
        }}
      >
        <DialogContent
          showCloseButton={!pending}
          className={cn(
            'max-h-[90dvh] overflow-y-auto',
            editor?.kind === 'details' && 'sm:max-w-xl'
          )}
        >
          <DialogHeader>
            <DialogTitle>
              {editor?.kind === 'create'
                ? 'Нова складська позиція'
                : editor?.kind === 'details'
                  ? 'Деталі складської позиції'
                  : editor?.kind === 'delete'
                    ? 'Видалення позиції назавжди'
                    : editor?.kind === 'edit'
                      ? 'Редагування позиції'
                      : editor?.kind === 'receipt'
                        ? 'Надходження на склад'
                        : editor?.kind === 'adjustment'
                          ? 'Коригування залишку'
                          : editor?.kind === 'valuation'
                            ? 'Оцінювання залишку'
                            : editor?.kind === 'reversal'
                              ? 'Скасування списання'
                              : 'Історія позиції'}
            </DialogTitle>
            <DialogDescription>
              {editor?.kind === 'delete'
                ? 'Остаточне видалення доступне лише для позицій без історії операцій.'
                : 'Внутрішній облік кількості та собівартості матеріалів автомалярки.'}
            </DialogDescription>
          </DialogHeader>
          {editor?.kind === 'details' && (
            <div className='flex min-w-0 flex-col gap-5'>
              <div className='flex min-w-0 items-start justify-between gap-3'>
                <h3 className='text-lg font-semibold break-words [overflow-wrap:anywhere]'>
                  {editor.item.name}
                </h3>
                {renderItemActions(editor.item, 'details')}
              </div>
              <div className='flex flex-wrap items-center gap-1.5'>
                <StockItemAvailability item={editor.item} />
                {editor.item.tags.map((tag) => (
                  <StockTagBadge key={tag} tag={tag} />
                ))}
              </div>
              <StockItemSummary item={editor.item} />
              <section className='flex flex-col gap-1'>
                <h4 className='font-medium'>Примітка</h4>
                <p className='text-muted-foreground whitespace-pre-wrap break-words [overflow-wrap:anywhere]'>
                  {editor.item.notes || 'Примітку не додано.'}
                </p>
              </section>
              <section className='flex min-w-0 flex-col gap-3'>
                <h4 className='font-medium'>Історія операцій</h4>
                <PagedMovements
                  key={editor.item.id}
                  userId={userId}
                  orgId={orgId}
                  itemId={editor.item.id}
                  onReverse={
                    admin ? (movement) => setEditor({ kind: 'reversal', movement }) : undefined
                  }
                />
              </section>
            </div>
          )}
          {editor?.kind === 'delete' && (
            <DeleteStockItem
              orgId={orgId}
              item={editor.item}
              onPendingChange={setPending}
              onCancel={() => setEditor(null)}
              onDeleted={() => {
                if (items.length === 1 && page > 1) void setPage(page - 1);
                setEditor(null);
              }}
            />
          )}
          {editor?.kind === 'create' && (
            <StockItemForm
              orgId={orgId}
              onPendingChange={setPending}
              onSaved={() => setEditor(null)}
            />
          )}
          {editor?.kind === 'edit' && (
            <StockItemForm
              orgId={orgId}
              item={editor.item}
              onPendingChange={setPending}
              onSaved={() => setEditor(null)}
            />
          )}
          {editor?.kind === 'valuation' && (
            <StockValuationForm
              key={editor.item.id}
              orgId={orgId}
              item={editor.item}
              onPendingChange={setPending}
              onSaved={() => setEditor(null)}
            />
          )}
          {(editor?.kind === 'receipt' || editor?.kind === 'adjustment') && (
            <StockOperationForm
              key={`${editor.kind}-${editor.item.id}`}
              orgId={orgId}
              kind={editor.kind}
              item={editor.item}
              onPendingChange={setPending}
              onSaved={() => setEditor(null)}
            />
          )}
          {editor?.kind === 'history' && (
            <PagedMovements
              key={editor.item.id}
              userId={userId}
              orgId={orgId}
              itemId={editor.item.id}
              onReverse={
                admin ? (movement) => setEditor({ kind: 'reversal', movement }) : undefined
              }
            />
          )}
          {editor?.kind === 'reversal' && (
            <StockReversalForm
              orgId={orgId}
              movement={editor.movement}
              onPendingChange={setPending}
              onSaved={() => setEditor(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
