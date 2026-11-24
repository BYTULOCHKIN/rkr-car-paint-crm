'use client';
import { useState, useMemo } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import type { DataTableFeatures } from '@/lib/data-table-features';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { crmQueries } from '../api/queries';
import type { CrmAccess, CrmWorkspace, RepairOrder } from '../api/types';
import { money, vehicleLabel } from './format';
import { contactSearchValues } from '../lib/customer-contacts';
import { historyTimestamp } from '../lib/workflow-history';
import { StatusBadge } from './status-badge';
import { CrmTable } from './crm-table';
import { Button } from './action-button';
import { CrmEditorDialog, type Editor } from './editor-dialog';

export function OrderTrashList({ access, search }: { access: CrmAccess; search: string }) {
  const { data } = useSuspenseQuery(crmQueries.trash(access.userId, access.orgId));
  const [editor, setEditor] = useState<Editor | null>(null);
  const customers = new Map(data.customers.map((entry) => [entry.id, entry.name]));
  const vehicles = new Map(data.vehicles.map((entry) => [entry.id, vehicleLabel(entry)]));
  const contacts = new Map(
    data.customers.map((customer) => [customer.id, contactSearchValues(customer)])
  );
  const vins = new Map(data.vehicles.map((vehicle) => [vehicle.id, vehicle.vin]));
  const rows = data.orders.filter((order) =>
    [
      String(order.number),
      customers.get(order.customerId),
      vehicles.get(order.vehicleId),
      order.description,
      ...(contacts.get(order.customerId) ?? []),
      vins.get(order.vehicleId),
      order.assigneeName,
      order.deletedBy?.name,
      ...order.items.map((item) => item.description)
    ]
      .join(' ')
      .toLocaleLowerCase('uk-UA')
      .includes(search)
  );
  const columns = useMemo(
    () => createTrashColumns(data, (order) => setEditor({ type: 'restoreOrder', order })),
    [data]
  );
  return (
    <div className='flex min-w-0 flex-col gap-4'>
      <p className='text-muted-foreground text-sm'>
        Замовлення зберігаються в кошику до відновлення. Номери та історія збережені.
      </p>
      {!data.orders.length ? (
        <Empty className='min-h-64 rounded-xl border'>
          <EmptyHeader>
            <EmptyTitle>Кошик порожній</EmptyTitle>
            <EmptyDescription>Тут з’являться замовлення, переміщені в кошик.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <CrmTable rows={rows} columns={columns} label='Кошик замовлень' />
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
