'use client';
import { OverflowText } from '@/components/data-table/table-cell-preview';
import { RowActions } from '@/features/crm/components/row-actions';

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
} from '@/components/ui/dialog';
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
import { stockQuantity } from '../lib/format';
import { money } from '@/features/crm/lib/format';
import { roundedRatio } from '@/features/order-economics/lib/integers';
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

const tagParser = parseAsArrayOf(parseAsStringLiteral(stockTags))
  .withDefault([])
  .withOptions({ shallow: true });

type Editor =
  | { kind: 'create' }
  | { kind: 'edit' | 'receipt' | 'adjustment' | 'history' | 'valuation'; item: StockItem }
  | { kind: 'reversal'; movement: StockMovement };

export function InventoryView({ userId, orgId }: { userId: string; orgId: string }) {
  const { data } = useSuspenseQuery(inventoryQueries.access(userId, orgId));
  const admin = data.access.role === 'admin';
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
  const [editor, setEditor] = useState<Editor | null>(null);
  const [pending, setPending] = useState(false);
  const client = useQueryClient();
  const archive = useMutation({
    ...inventoryMutations.archive(orgId),
    onSuccess: () => toast.success('Збережено'),
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
                {items.map((item) => (
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
                    <TableCell className='tabular-nums'>
                      {stockQuantity(item.balanceMilli)} {item.unit}
                    </TableCell>
                    <TableCell className='tabular-nums'>
                      {item.totalCostCents === null ? 'Не визначена' : money(item.totalCostCents)}
                    </TableCell>
                    <TableCell className='tabular-nums'>
                      {item.totalCostCents === null
                        ? 'Не визначена'
                        : item.balanceMilli === 0
                          ? '—'
                          : `${money(roundedRatio(BigInt(item.totalCostCents) * BigInt(1000), BigInt(item.balanceMilli)))} / ${item.unit}`}
                    </TableCell>
                    <TableCell>
                      <RowActions
                        label={`Дії з позицією ${item.name}`}
                        actions={[
                          {
                            label: 'Історія',
                            icon: 'clock',
                            onClick: () => setEditor({ kind: 'history', item })
                          },
                          ...(admin
                            ? [
                                ...(!item.archived
                                  ? [
                                      ...(item.totalCostCents === null && item.balanceMilli > 0
                                        ? [
                                            {
                                              label: 'Оцінити залишок',
                                              icon: 'edit' as const,
                                              onClick: () => setEditor({ kind: 'valuation', item })
                                            }
                                          ]
                                        : []),
                                      {
                                        label: 'Надходження',
                                        icon: 'add' as const,
                                        onClick: () => setEditor({ kind: 'receipt', item })
                                      },
                                      {
                                        label: 'Коригувати',
                                        icon: 'adjustments' as const,
                                        onClick: () => setEditor({ kind: 'adjustment', item })
                                      }
                                    ]
                                  : []),
                                {
                                  label: 'Редагувати',
                                  icon: 'edit' as const,
                                  onClick: () => setEditor({ kind: 'edit', item })
                                },
                                {
                                  label: item.archived ? 'Відновити' : 'В архів',
                                  icon: 'inventory' as const,
                                  disabled: archive.isPending,
                                  onClick: () =>
                                    archive.mutate({ id: item.id, archived: !item.archived })
                                }
                              ]
                            : [])
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
        open={!!editor}
        onOpenChange={(open) => {
          if (!open && !pending) setEditor(null);
        }}
      >
        <DialogContent showCloseButton={!pending} className='max-h-[90dvh] overflow-y-auto'>
          <DialogHeader>
            <DialogTitle>
              {editor?.kind === 'create'
                ? 'Нова складська позиція'
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
              Внутрішній облік кількості та собівартості матеріалів автомалярки.
            </DialogDescription>
          </DialogHeader>
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
