'use client';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { DataTableFeatures } from '@/lib/data-table-features';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { crmQueries } from '../api/queries';
import type { CrmAccess, CrmWorkspace, RepairOrder } from '../api/types';
import { money, vehicleLabel } from './format';
import { parseAsInteger, useQueryStates } from 'nuqs';
import { historyTimestamp } from '../lib/workflow-history';
import { StatusBadge } from './status-badge';
import { CrmTable } from './crm-table';
import { Button } from './action-button';
import { CrmEditorDialog, type Editor } from './editor-dialog';

export function OrderTrashList({ access, search }: { access: CrmAccess; search: string }) {
  const [params] = useQueryStates(
    { page: parseAsInteger.withDefault(1), perPage: parseAsInteger.withDefault(10) },
    { shallow: true }
  );
  const result = useQuery(
    crmQueries.list(access.userId, access.orgId, {
      entity: 'orders',
      trash: true,
      search,
      page: Math.max(1, params.page),
      pageSize: Math.min(100, Math.max(1, params.perPage))
    })
  );
  const data = useMemo(
    () =>
      result.data ?? {
        customers: [],
        vehicles: [],
        requests: [],
        orders: [],
        events: [],
        access
      },
    [result.data, access]
  );
  const [editor, setEditor] = useState<Editor | null>(null);
  const rows = data.orders;
  const columns = useMemo(
    () => createTrashColumns(data, (order) => setEditor({ type: 'restoreOrder', order })),
    [data]
  );
  return (
    <div className='flex min-w-0 flex-col gap-4'>
      <p className='text-muted-foreground text-sm'>
        Замовлення зберігаються в кошику до відновлення. Номери та історія збережені.
      </p>
      {result.isPending ? (
        <p role='status'>Завантажуємо кошик…</p>
      ) : result.isError ? (
        <div role='alert'>
          Не вдалося завантажити кошик.{' '}
          <Button onClick={() => void result.refetch()}>Повторити</Button>
        </div>
      ) : (data.pagination?.total ?? data.orders.length) === 0 ? (
        <Empty className='min-h-64 rounded-xl border'>
          <EmptyHeader>
            <EmptyTitle>Кошик порожній</EmptyTitle>
            <EmptyDescription>Тут з’являться замовлення, переміщені в кошик.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <CrmTable
          total={data.pagination?.total}
          rows={rows}
          columns={columns}
          label='Кошик замовлень'
        />
      )}
      {editor && (
        <CrmEditorDialog
          editor={editor}
          data={data}
          onClose={() => setEditor(null)}
          onSelectOrder={() => undefined}
        />
      )}
    </div>
  );
}

function createTrashColumns(
  data: CrmWorkspace,
  onRestore: (order: RepairOrder) => void
): ColumnDef<DataTableFeatures, RepairOrder>[] {
  const customers = new Map(data.customers.map((entry) => [entry.id, entry.name]));
  const vehicles = new Map(data.vehicles.map((entry) => [entry.id, vehicleLabel(entry)]));
  return [
    {
      id: 'number',
      header: 'Замовлення',
      size: 125,
      cell: ({ row }) => <strong>№{row.original.number}</strong>
    },
    {
      id: 'customer',
      header: 'Клієнт і авто',
      size: 250,
      cell: ({ row }) => (
        <div className='flex max-w-64 flex-col gap-1 whitespace-normal break-words'>
          <span>{customers.get(row.original.customerId) ?? '—'}</span>
          <span className='text-muted-foreground'>
            {vehicles.get(row.original.vehicleId) ?? '—'}
          </span>
        </div>
      )
    },
    {
      id: 'status',
      header: 'Попередній статус',
      size: 150,
      cell: ({ row }) => <StatusBadge status={row.original.status} />
    },
    {
      id: 'total',
      header: 'Вартість',
      size: 150,
      cell: ({ row }) => money(row.original.totalCents)
    },
    {
      id: 'deletedAt',
      header: 'Переміщено в кошик',
      size: 200,
      cell: ({ row }) => (
        <div className='flex flex-col gap-1 text-sm'>
          <time dateTime={row.original.deletedAt!}>
            {historyTimestamp(row.original.deletedAt!)}
          </time>
          <span className='text-muted-foreground'>
            {row.original.deletedBy?.name ?? 'Адміністратор'}
          </span>
        </div>
      )
    },
    {
      id: 'actions',
      header: 'Дії',
      size: 130,
      cell: ({ row }) => (
        <Button
          variant='outline'
          aria-label={`Відновити замовлення №${row.original.number}`}
          onClick={() => onRestore(row.original)}
        >
          Відновити
        </Button>
      )
    }
  ];
}
