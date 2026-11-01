'use client';

import { useMemo, useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import type { DataTableFeatures } from '@/lib/data-table-features';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { SummaryCards } from './summary-cards';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { crmQueries } from '../api/queries';
import type { CrmWorkspace, CrmView, Customer, RepairRequest, RepairOrder } from '../api/types';
import { CrmEditorDialog, type Editor } from './editor-dialog';
import { Button } from './action-button';
import { money, vehicleLabel } from './format';
import { statusLabel } from '../lib/workflow';
import { WorkflowDatePreview } from './workflow-details';
import { CrmTable } from './crm-table';
import { RowActions } from './row-actions';

const date = new Intl.DateTimeFormat('uk-UA', { dateStyle: 'short' });

function createColumns(data: CrmWorkspace, setEditor: (editor: Editor) => void) {
  const customersById = new Map(data.customers.map((customer) => [customer.id, customer]));
  const vehiclesById = new Map(data.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const customerName = (id: string) => customersById.get(id)?.name ?? '—';
  const car = (id: string) => {
    const vehicle = vehiclesById.get(id);
    return vehicle ? vehicleLabel(vehicle) : '—';
  };
  const customerColumns: ColumnDef<DataTableFeatures, Customer>[] = [
    {
      id: 'name',
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} label='Клієнт' />,
      cell: ({ row }) => (
        <div>
          <p className='max-w-64 truncate font-medium' title={row.original.name}>
            {row.original.name}
          </p>
          <p className='text-muted-foreground max-w-52 truncate text-xs' title={row.original.notes}>
            {row.original.notes}
          </p>
        </div>
      )
    },
    {
      id: 'phone',
      accessorKey: 'phone',
      header: 'Телефон',
      cell: ({ row }) => (
        <a href={`tel:${row.original.phone}`} className='underline underline-offset-4'>
          {row.original.phone}
        </a>
      )
    },
    {
      id: 'vehicles',
      header: 'Автомобілі',
      cell: ({ row }) => {
        const vehicles = data.vehicles.filter((vehicle) => vehicle.customerId === row.original.id);
        return (
          <div className='flex flex-col gap-3 py-2'>
            {vehicles.length ? (
              vehicles.slice(0, 2).map((vehicle) => (
                <div key={vehicle.id}>
                  <p className='max-w-80 truncate' title={vehicleLabel(vehicle)}>
                    {vehicleLabel(vehicle)}
                  </p>
                  {vehicle.vin ? (
                    <p className='text-muted-foreground font-mono text-xs'>{vehicle.vin}</p>
                  ) : (
                    <Button
                      size='xs'
                      variant='outline'
                      onClick={() => setEditor({ type: 'vin', vehicle })}
                    >
                      Додати VIN
                    </Button>
                  )}
                </div>
              ))
            ) : (
              <span className='text-muted-foreground'>Ще немає автомобілів</span>
            )}
            {vehicles.length > 2 && (
              <Button
                size='xs'
                variant='link'
                className='w-fit px-0'
                onClick={() => setEditor({ type: 'history', customer: row.original })}
              >
                Ще {vehicles.length - 2} · переглянути всі
              </Button>
            )}
          </div>
        );
      }
    },
    {
      id: 'actions',
      header: 'Дії',
      cell: ({ row }) => (
        <RowActions
          label={`Дії з клієнтом ${row.original.name}`}
          actions={[
            {
              label: 'Додати авто',
              onClick: () => setEditor({ type: 'vehicle', customer: row.original })
            },
            {
              label: 'Автомобілі та історія',
              onClick: () => setEditor({ type: 'history', customer: row.original })
            }
          ]}
        />
      )
    }
  ];
  const requestColumns: ColumnDef<DataTableFeatures, RepairRequest>[] = [
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: ({ column }) => <DataTableColumnHeader column={column} label='Дата' />,
      cell: ({ row }) => date.format(new Date(row.original.createdAt))
    },
    {
      id: 'customer',
      accessorFn: (request) => customerName(request.customerId),
      header: 'Клієнт',
      cell: ({ row }) => (
        <div>
          <p
            className='max-w-52 truncate font-medium'
            title={customerName(row.original.customerId)}
          >
            {customerName(row.original.customerId)}
          </p>
          <p className='text-muted-foreground text-xs'>
            {customersById.get(row.original.customerId)?.phone}
          </p>
        </div>
      )
    },
    {
      id: 'vehicle',
      accessorFn: (request) => car(request.vehicleId),
      header: 'Автомобіль',
      cell: ({ row }) => (
        <p className='max-w-56 truncate' title={car(row.original.vehicleId)}>
          {car(row.original.vehicleId)}
        </p>
      )
    },
    {
      id: 'description',
      accessorKey: 'description',
      header: 'Потрібні роботи',
      cell: ({ row }) => (
        <p
          className='line-clamp-2 max-w-64 break-words whitespace-normal'
          title={row.original.description}
        >
          {row.original.description}
        </p>
      )
    },
    {
      id: 'status',
      header: 'Статус',
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'backlog' ? 'secondary' : 'outline'}>
          {statusLabel(row.original.status)}
        </Badge>
      )
    },
    {
      id: 'actions',
      header: 'Дії',
      cell: ({ row }) => {
        const request = row.original;
        const order = data.orders.find((entry) => entry.requestId === request.id);
        const vehicle = vehiclesById.get(request.vehicleId);
        return (
          <RowActions
            label={`Дії із заявкою ${customerName(request.customerId)}`}
            actions={
              order
                ? [
                    {
                      label: `Замовлення №${order.number}`,
                      onClick: () => setEditor({ type: 'order', order })
                    }
                  ]
                : [
                    {
                      label: 'Переглянути · статус і дати',
                      onClick: () =>
                        setEditor({
                          type: 'workflow',
                          target: { kind: 'request', record: request }
                        })
                    },
                    {
                      label: vehicle?.vin ? 'Взяти в роботу' : 'Спочатку додати VIN',
                      disabled: !vehicle,
                      onClick: () => {
                        if (vehicle?.vin) setEditor({ type: 'order', request });
                        else if (vehicle) setEditor({ type: 'vin', vehicle });
                      }
                    }
                  ]
            }
          />
        );
      }
    }
  ];
  const orderColumns: ColumnDef<DataTableFeatures, RepairOrder>[] = [
    {
      id: 'number',
      accessorKey: 'number',
      header: ({ column }) => <DataTableColumnHeader column={column} label='Замовлення' />,
      cell: ({ row }) => (
        <div>
          <Button
            size='xs'
            variant='link'
            className='h-auto px-0 font-medium'
            aria-label={`Відкрити замовлення №${row.original.number}`}
            onClick={() => setEditor({ type: 'order', order: row.original })}
          >
            №{row.original.number}
          </Button>
          <p className='text-muted-foreground text-xs'>
            {date.format(new Date(row.original.createdAt))}
          </p>
        </div>
      )
    },
    {
      id: 'customer',
      accessorFn: (order) => customerName(order.customerId),
      header: 'Клієнт',
      cell: ({ row }) => (
        <p className='max-w-48 truncate' title={customerName(row.original.customerId)}>
          {customerName(row.original.customerId)}
        </p>
      )
    },
    {
      id: 'vehicle',
      accessorFn: (order) => car(order.vehicleId),
      header: 'Автомобіль',
      cell: ({ row }) => (
        <div>
          <p className='max-w-56 truncate' title={car(row.original.vehicleId)}>
            {car(row.original.vehicleId)}
          </p>
          <p className='text-muted-foreground font-mono text-xs'>
            {vehiclesById.get(row.original.vehicleId)?.vin}
          </p>
        </div>
      )
    },
    {
      id: 'description',
      accessorKey: 'description',
      header: 'Роботи',
      cell: ({ row }) => (
        <div className='flex max-w-80 min-w-40 flex-col gap-1'>
          <p
            className='line-clamp-2 break-words whitespace-normal'
            title={row.original.description}
          >
            {row.original.description}
          </p>
          <p className='text-muted-foreground text-xs'>Позицій: {row.original.items.length}</p>
        </div>
      )
    },
    {
      id: 'totalCents',
      accessorKey: 'totalCents',
      header: ({ column }) => (
        <div className='flex justify-end'>
          <DataTableColumnHeader column={column} label='Сума' />
        </div>
      ),
      cell: ({ row }) => (
        <span className='block text-right font-medium tabular-nums'>
          {money(row.original.totalCents)}
        </span>
      )
    },
    {
      id: 'status',
      header: 'Статус',
      cell: ({ row }) => <Badge variant='secondary'>{statusLabel(row.original.status)}</Badge>
    },
    {
      id: 'actions',
      header: 'Дії',
      cell: ({ row }) => (
        <RowActions
          label={`Дії із замовленням №${row.original.number}`}
          actions={[
            { label: 'Відкрити', onClick: () => setEditor({ type: 'order', order: row.original }) },
            {
              label: 'Статус і дати',
              onClick: () =>
                setEditor({ type: 'workflow', target: { kind: 'order', record: row.original } })
            }
          ]}
        />
      )
    }
  ];

  requestColumns.splice(requestColumns.length - 1, 0, {
    id: 'dates',
    header: 'Дати',
    cell: ({ row }) => <WorkflowDatePreview target={{ kind: 'request', record: row.original }} />
  });
  orderColumns.splice(orderColumns.length - 1, 0, {
    id: 'dates',
    header: 'План і факт',
    cell: ({ row }) => <WorkflowDatePreview target={{ kind: 'order', record: row.original }} />
  });
  // Explicit widths keep content from changing the geometry of sticky action cells.
  const sizes: Record<string, number> = {
    name: 280,
    phone: 170,
    vehicles: 360,
    createdAt: 112,
    number: 132,
    customer: 220,
    vehicle: 260,
    description: 260,
    totalCents: 155,
    status: 150,
    dates: 230,
    actions: 64
  };
  for (const columns of [customerColumns, requestColumns, orderColumns]) {
    for (const column of columns) column.size = sizes[column.id ?? ''] ?? 150;
  }
  return { customerColumns, requestColumns, orderColumns };
}

interface CrmWorkspaceViewProps {
  view: CrmView;
  userId: string;
}

export function CrmWorkspaceView({ view, userId }: CrmWorkspaceViewProps) {
  const { data } = useSuspenseQuery(crmQueries.workspace(userId));
  const [editor, setEditor] = useState<Editor | null>(null);
  const [params, setParams] = useQueryStates(
    {
      q: parseAsString.withDefault(''),
      page: parseAsInteger.withDefault(1),
      requestStatus: parseAsString.withDefault('backlog')
    },
    { shallow: true }
  );
  const search = params.q.toLocaleLowerCase('uk-UA').trim();
  const close = () => setEditor(null);

  const { customerColumns, requestColumns, orderColumns } = useMemo(
    () => createColumns(data, setEditor),
    [data]
  );

  const { customers, requests, orders } = useMemo(() => {
    const matches = (...values: (string | null | undefined)[]) =>
      values.join(' ').toLocaleLowerCase('uk-UA').includes(search);
    const customersById = new Map(data.customers.map((customer) => [customer.id, customer]));
    const vehiclesById = new Map(data.vehicles.map((vehicle) => [vehicle.id, vehicle]));
    const customerName = (id: string) => customersById.get(id)?.name ?? '—';
    const car = (id: string) => {
      const vehicle = vehiclesById.get(id);
      return vehicle ? vehicleLabel(vehicle) : '—';
    };
    const customers = data.customers.filter((customer) =>
      matches(
        customer.name,
        customer.phone,
        customer.notes,
        ...data.vehicles
          .filter((vehicle) => vehicle.customerId === customer.id)
          .flatMap((vehicle) => [vehicleLabel(vehicle), vehicle.vin])
      )
    );
    const requests = data.requests.filter(
      (request) =>
        (params.requestStatus === 'all' || request.status !== 'converted') &&
        matches(
          customerName(request.customerId),
          customersById.get(request.customerId)?.phone,
          car(request.vehicleId),
          vehiclesById.get(request.vehicleId)?.vin,
          request.description
        )
    );
    const orders = data.orders.filter((order) =>
      matches(
        String(order.number),
        customerName(order.customerId),
        customersById.get(order.customerId)?.phone,
        car(order.vehicleId),
        vehiclesById.get(order.vehicleId)?.vin,
        order.description,
        ...order.items.map((item) => item.description)
      )
    );
    return { customers, requests, orders };
  }, [data, search, params.requestStatus]);
  const empty =
    view === 'customers'
      ? !data.customers.length
      : view === 'requests'
        ? !data.requests.length
        : !data.orders.length;
  const create = () =>
    setEditor({
      type: view === 'customers' ? 'customer' : view === 'requests' ? 'request' : 'order'
    });
  const createLabel =
    view === 'customers'
      ? 'Додати клієнта'
      : view === 'requests'
        ? 'Нова заявка'
        : 'Нове замовлення';

  return (
    <div className='flex flex-1 flex-col gap-4'>
      <SummaryCards data={data} />
      <div className='flex flex-wrap items-center gap-3'>
        <Input
          aria-label='Пошук за клієнтом, автомобілем, VIN або роботами'
          placeholder='Клієнт, телефон, автомобіль, VIN…'
          className='w-full sm:max-w-sm'
          value={params.q}
          onChange={(event) => {
            void setParams({ q: event.target.value, page: 1 });
          }}
        />
        {view === 'requests' && (
          <Button
            variant='outline'
            onClick={() => {
              void setParams({
                requestStatus: params.requestStatus === 'all' ? 'backlog' : 'all',
                page: 1
              });
            }}
          >
            {params.requestStatus === 'all' ? 'Показати лише активні' : 'Показати всі заявки'}
          </Button>
        )}
        <Button onClick={create}>{createLabel}</Button>
      </div>
      {empty ? (
        <Empty className='min-h-64 rounded-xl border'>
          <EmptyHeader>
            <EmptyTitle>
              {view === 'customers'
                ? 'Додайте першого клієнта'
                : view === 'requests'
                  ? 'Заявок поки немає'
                  : 'Замовлень поки немає'}
            </EmptyTitle>
            <EmptyDescription>
              {view === 'customers'
                ? 'Створіть клієнта, додайте його автомобіль і запишіть на ремонт.'
                : view === 'requests'
                  ? 'Заявка — попередній запис. VIN можна додати пізніше.'
                  : 'Візьміть заявку в роботу або створіть замовлення напряму.'}
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={create}>{createLabel}</Button>
        </Empty>
      ) : view === 'customers' ? (
        <CrmTable rows={customers} columns={customerColumns} label='Клієнти' />
      ) : view === 'requests' ? (
        <CrmTable rows={requests} columns={requestColumns} label='Заявки' />
      ) : (
        <CrmTable rows={orders} columns={orderColumns} label='Замовлення' />
      )}
      {editor && (
        <CrmEditorDialog
          key={
            editor.type === 'order'
              ? (editor.order?.id ?? editor.request?.id ?? 'new-order')
              : editor.type === 'vehicle' || editor.type === 'history'
                ? (editor.customer?.id ?? 'new') + editor.type
                : editor.type === 'vin'
                  ? editor.vehicle.id
                  : editor.type
          }
          editor={editor}
          data={data}
          onClose={close}
          onSelectOrder={(order) => setEditor({ type: 'order', order })}
        />
      )}
    </div>
  );
}
