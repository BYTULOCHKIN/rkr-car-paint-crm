'use client';
import { OverflowText } from '@/components/data-table/table-cell-preview';
import { RowActions } from '@/features/crm/components/row-actions';

import { useState } from 'react';
import { useSuspenseQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { parseAsBoolean, parseAsString, useQueryState } from 'nuqs';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { StockItemForm, StockOperationForm, StockReversalForm } from './stock-forms';
import { MovementHistory } from './movement-history';

type Editor =
  | { kind: 'create' }
  | { kind: 'edit' | 'receipt' | 'adjustment' | 'history'; item: StockItem }
  | { kind: 'reversal'; movement: StockMovement };

export function InventoryView({ userId, orgId }: { userId: string; orgId: string }) {
  const { data } = useSuspenseQuery(inventoryQueries.workspace(userId, orgId));
  const admin = data.access.role === 'admin';
  const [search, setSearch] = useQueryState(
    'stockSearch',
    parseAsString.withDefault('').withOptions({ shallow: true })
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
  const items = data.items.filter(
    (item) =>
      item.archived === archived &&
      item.name.toLocaleLowerCase('uk-UA').includes(search.toLocaleLowerCase('uk-UA'))
  );
  return (
    <div className='flex min-w-0 flex-col gap-5'>
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          aria-label='Пошук складських позицій'
          placeholder='Знайти позицію…'
          value={search}
          onChange={(event) => void setSearch(event.target.value)}
          className='w-full sm:max-w-sm'
        />
        <Button variant='outline' onClick={() => void setArchived(!archived)}>
          {archived ? 'Показати активні' : 'Показати архів'}
        </Button>
        {admin && <Button onClick={() => setEditor({ kind: 'create' })}>Нова позиція</Button>}
      </div>
      {!admin && (
        <p className='text-muted-foreground text-sm'>
          Склад доступний для перегляду. Операції проводить адміністратор.
        </p>
      )}
      {items.length ? (
        <Table className='[&_td]:py-1.5'>
          <TableHeader>
            <TableRow>
              <TableHead>Позиція</TableHead>
              <TableHead>Залишок</TableHead>
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
                <TableCell className='tabular-nums'>
                  {stockQuantity(item.balanceMilli)} {item.unit}
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
              {archived
                ? 'В архіві немає відповідних позицій.'
                : 'Створіть позицію, потім додайте перше надходження.'}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <section className='flex flex-col gap-3'>
        <h2 className='text-lg font-semibold'>Останні операції</h2>
        <MovementHistory
          movements={data.movements.slice(0, 50)}
          onReverse={admin ? (movement) => setEditor({ kind: 'reversal', movement }) : undefined}
        />
        {data.movements.length > 50 && (
          <p className='text-muted-foreground text-sm'>
            Показано останні 50 операцій. Повна історія доступна в кожній позиції.
          </p>
        )}
      </section>
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
                      : editor?.kind === 'reversal'
                        ? 'Скасування списання'
                        : 'Історія позиції'}
            </DialogTitle>
            <DialogDescription>
              Внутрішній кількісний облік матеріалів автомалярки.
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
            <MovementHistory
              movements={data.movements.filter((movement) => movement.itemId === editor.item.id)}
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
