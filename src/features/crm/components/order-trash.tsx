'use client';
import { useState, useMemo, useEffect } from 'react';
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
import { RowActions } from './row-actions';
import { Button } from './action-button';
import { CrmEditorDialog, type Editor } from './editor-dialog';

export function OrderTrashList({ access, search }: { access: CrmAccess; search: string }) {
  const [params, setParams] = useQueryStates(
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
    () =>
      createTrashColumns(
        data,
        (order) => setEditor({ type: 'restoreOrder', order }),
        (order) => setEditor({ type: 'deleteOrder', order })
      ),
    [data]
  );
  useEffect(() => {
    const pagination = result.data?.pagination;
    if (!pagination || result.isFetching || pagination.page !== params.page) return;
    const lastPage = Math.max(1, Math.ceil(pagination.total / pagination.pageSize));
    if (params.page > lastPage) void setParams({ page: lastPage });
  }, [result.data, result.isFetching, params.page, setParams]);
  return (
    <div className='flex min-w-0 flex-col gap-4'>
      <p className='text-muted-foreground text-sm'>
        Замовлення можна відновити або видалити назавжди, якщо вони не мають складських і фінансових
        операцій. До остаточного видалення номери та історія зберігаються.
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
  onRestore: (order: RepairOrder) => void,
  onDelete: (order: RepairOrder) => void
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
      size: 180,
      cell: ({ row }) => (
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            aria-label={`Відновити замовлення №${row.original.number}`}
            onClick={() => onRestore(row.original)}
          >
            Відновити
          </Button>
          {data.access?.role === 'admin' && (
            <RowActions
              label={`Дії із замовленням у кошику №${row.original.number}`}
              actions={[
                {
                  label: 'Видалити назавжди',
                  icon: 'trash',
                  variant: 'destructive',
                  disabled: !!row.original.trashBlockedReason,
                  description: row.original.trashBlockedReason ?? undefined,
                  onClick: () => onDelete(row.original)
                }
              ]}
            />
          )}
        </div>
      )
    }
  ];
}
