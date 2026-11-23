'use client';
import Link from 'next/link';
import { SHOW_LEGACY_REQUEST_FLOW } from '@/config/product';
import PageContainer from '@/components/layout/page-container';
import { Icons } from '@/components/icons';
import { Button as HeaderButton, buttonVariants } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem
} from '@/components/ui/dropdown-menu';
import { assigneeLabel } from '../lib/assignee';
import { PersonAvatar } from '@/components/person-avatar';
import { VehicleBrandAvatar } from '@/components/vehicle-brand-avatar';

import { useMemo, useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { parseAsInteger, parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import type { DataTableFeatures } from '@/lib/data-table-features';
import { Input } from '@/components/ui/input';
import { SummaryCards } from './summary-cards';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { crmQueries } from '../api/queries';
import type { CrmWorkspace, CrmView, Customer, RepairRequest, RepairOrder } from '../api/types';
import { CrmEditorDialog, type Editor } from './editor-dialog';
import { Button } from './action-button';
import { money, vehicleLabel } from './format';
import { StatusBadge } from './status-badge';
import { paymentBalance } from '../lib/payment-balance';
import { statusLabel } from '../lib/workflow';
import { WorkflowDatePreview } from './workflow-details';
import { CrmTable } from './crm-table';
import { primaryContact, contactSearchValues } from '../lib/customer-contacts';
import { CustomerContactsPreview } from './customer-contacts';
import { RowActions } from './row-actions';
import { OverflowText } from '@/components/data-table/table-cell-preview';
import { OrderWorkPreview, CustomerCarsPreview } from './table-previews';

const date = new Intl.DateTimeFormat('uk-UA', { dateStyle: 'short' });

function createColumns(data: CrmWorkspace, setEditor: (editor: Editor) => void) {
  const customersById = new Map(data.customers.map((customer) => [customer.id, customer]));
  const vehiclesById = new Map(data.vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const customerName = (id: string) => customersById.get(id)?.name ?? '—';
  const car = (id: string) => {
    const vehicle = vehiclesById.get(id);
    return vehicle ? vehicleLabel(vehicle) : '—';
  };
  function carCell(id: string, showVin = false) {
    const vehicle = vehiclesById.get(id);
    return (
      <div className='flex min-w-0 items-center gap-2'>
        <VehicleBrandAvatar make={vehicle?.make} size='sm' />
        <div className='min-w-0'>
          <OverflowText text={car(id)} />
          {showVin && <p className='text-muted-foreground font-mono text-xs'>{vehicle?.vin}</p>}
        </div>
      </div>
    );
  }
  const customerColumns: ColumnDef<DataTableFeatures, Customer>[] = [
    {
      id: 'name',
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} label='Клієнт' />,
      cell: ({ row }) => (
        <div className='flex min-w-0 items-center gap-3'>
          <PersonAvatar identity={`customer:${row.original.id}`} name={row.original.name} />
          <div className='min-w-0'>
            <HeaderButton
              type='button'
              variant='link'
              className='h-auto min-h-6 w-full min-w-0 justify-start p-0 text-left font-medium'
              aria-label={`Редагувати клієнта ${row.original.name}`}
              onClick={() => setEditor({ type: 'customer', customer: row.original })}
            >
              <span className='min-w-0 truncate'>{row.original.name}</span>
            </HeaderButton>
            <OverflowText
              className='text-muted-foreground max-w-52 text-xs'
              text={row.original.notes}
            />
          </div>
        </div>
      )
    },
    {
      id: 'createdAt',
      accessorKey: 'createdAt',
      header: 'Створено',
      cell: ({ row }) => (
        <span className='text-muted-foreground text-xs tabular-nums'>
          {date.format(new Date(row.original.createdAt))}
        </span>
      )
    },
    {
      id: 'phone',
      header: 'Контакти',
      cell: ({ row }) => <CustomerContactsPreview customer={row.original} />
    },
    {
      id: 'vehicles',
      header: 'Автомобілі',
      cell: ({ row }) => {
        const vehicles = data.vehicles.filter((vehicle) => vehicle.customerId === row.original.id);
        return (
          <CustomerCarsPreview
            vehicles={vehicles}
            onVin={(vehicle) => setEditor({ type: 'vin', vehicle })}
            onHistory={() => setEditor({ type: 'history', customer: row.original })}
          />
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
              label: 'Редагувати',
              icon: 'edit',
              onClick: () => setEditor({ type: 'customer', customer: row.original })
            },
            {
              label: 'Додати авто',
              icon: 'car',
              onClick: () => setEditor({ type: 'vehicle', customer: row.original })
            },
            {
              label: 'Автомобілі та історія',
              icon: 'clock',
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
          <OverflowText
            className='max-w-52  font-medium'
            text={customerName(row.original.customerId)}
          />
          <p className='text-muted-foreground text-xs'>
            {primaryContact(customersById.get(row.original.customerId))}
          </p>
        </div>
      )
    },
    {
      id: 'vehicle',
      accessorFn: (request) => car(request.vehicleId),
      header: 'Автомобіль',
      cell: ({ row }) => carCell(row.original.vehicleId)
    },
    {
      id: 'description',
      accessorKey: 'description',
      header: 'Потрібні роботи',
      cell: ({ row }) => <OverflowText text={row.original.description} label='Опис заявки' />
    },
    {
      id: 'status',
      header: 'Статус',
      cell: ({ row }) => <StatusBadge status={row.original.status} />
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
                      label: vehicle?.vin ? 'Створити замовлення' : 'Спочатку додати VIN',
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
        <OverflowText className='max-w-48' text={customerName(row.original.customerId)} />
      )
    },
    {
      id: 'vehicle',
      accessorFn: (order) => car(order.vehicleId),
      header: 'Автомобіль',
      cell: ({ row }) => carCell(row.original.vehicleId, true)
    },
    {
      id: 'description',
      accessorKey: 'description',
      header: 'Роботи',
      cell: ({ row }) => <OrderWorkPreview order={row.original} />
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
          <span className='block text-xs font-normal text-muted-foreground'>
            {paymentBalance(row.original, data.payments).status}
          </span>
        </span>
      )
    },
    {
      id: 'assignee',
      header: 'Відповідальний',
      accessorFn: (order) => assigneeLabel(order, data.team),
      cell: ({ row }) => (
        <OverflowText className='max-w-48' text={assigneeLabel(row.original, data.team)} />
      )
    },
    {
      id: 'status',
      header: 'Статус',
      cell: ({ row }) => <StatusBadge status={row.original.status} />
    },
    {
      id: 'actions',
      header: 'Дії',
      cell: ({ row }) => (
        <RowActions
          label={`Дії із замовленням №${row.original.number}`}
          actions={[
            {
              label: 'Відкрити',
              icon: 'page',
              onClick: () => setEditor({ type: 'order', order: row.original })
            },
            {
              label: 'Матеріали і витрати',
              icon: 'inventory',
              onClick: () => setEditor({ type: 'order', order: row.original, tab: 'materials' })
            },
            {
              label: 'Оплати клієнта',
              icon: 'billing',
              onClick: () => setEditor({ type: 'order', order: row.original, tab: 'payments' })
            },
            {
              label: data.access?.role === 'worker' ? 'Оновити статус' : 'Статус і дати',
              icon: 'clock',
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
  orderColumns.splice(
    3,
    0,
    orderColumns.splice(
      orderColumns.findIndex((column) => column.id === 'status'),
      1
    )[0]
  );
  orderColumns.splice(4, 0, {
    id: 'dates',
    header: 'План і факт',
    cell: ({ row }) => <WorkflowDatePreview target={{ kind: 'order', record: row.original }} />
  });
  // Explicit widths keep content from changing the geometry of sticky action cells.
  const sizes: Record<string, number> = {
    name: 280,
    phone: 170,
    vehicles: 280,
    createdAt: 112,
    number: 132,
    customer: 180,
    vehicle: 230,
    description: 210,
    totalCents: 140,
    status: 120,
    dates: 145,
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
  orgId?: string | null;
}

export function CrmWorkspaceView({ view, userId, orgId }: CrmWorkspaceViewProps) {
  const { data } = useSuspenseQuery(crmQueries.workspace(userId, orgId));
  const [editor, setEditor] = useState<Editor | null>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [params, setParams] = useQueryStates(
    {
      q: parseAsString.withDefault(''),
      page: parseAsInteger.withDefault(1),
      customerOrder: parseAsStringLiteral(['newest', 'oldest']).withDefault('newest'),
      sort: parseAsString,
      requestStatus: parseAsString.withDefault('all'),
      orderStatus: parseAsStringLiteral(['all', 'created', 'in_progress', 'ready']).withDefault(
        'all'
      )
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
    const customers = data.customers
      .filter((customer) =>
        matches(
          customer.name,
          ...contactSearchValues(customer),
          customer.notes,
          ...data.vehicles
            .filter((vehicle) => vehicle.customerId === customer.id)
            .flatMap((vehicle) => [vehicleLabel(vehicle), vehicle.vin])
        )
      )
      .toSorted((a, b) => {
        const difference = Date.parse(a.createdAt) - Date.parse(b.createdAt);
        return (
          (params.customerOrder === 'oldest' ? difference : -difference) || a.id.localeCompare(b.id)
        );
      });
    const requests = data.requests.filter(
      (request) =>
        (params.requestStatus === 'all' || request.status !== 'converted') &&
        matches(
          customerName(request.customerId),
          ...contactSearchValues(customersById.get(request.customerId)),
          car(request.vehicleId),
          vehiclesById.get(request.vehicleId)?.vin,
          request.description
        )
    );
    const orders = data.orders.filter(
      (order) =>
        (params.orderStatus === 'all' || order.status === params.orderStatus) &&
        matches(
          String(order.number),
          customerName(order.customerId),
          ...contactSearchValues(customersById.get(order.customerId)),
          car(order.vehicleId),
          vehiclesById.get(order.vehicleId)?.vin,
          order.description,
          assigneeLabel(order, data.team),
          ...order.items.map((item) => item.description)
        )
    );
    return { customers, requests, orders };
  }, [data, search, params.requestStatus, params.customerOrder, params.orderStatus]);
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

  if (data.access?.role === 'worker' && view !== 'orders')
    return (
      <p className='text-sm text-muted-foreground'>
        Цей розділ доступний адміністратору. Для роботи перейдіть до замовлень.
      </p>
    );
  const searchControl = (
    <Input
      aria-label='Пошук за клієнтом, автомобілем, VIN або роботами'
      placeholder='Клієнт, телефон, автомобіль, VIN…'
      className='w-full min-w-0 sm:w-72'
      value={params.q}
      onChange={(event) => void setParams({ q: event.target.value, page: 1 })}
    />
  );
  const content = (
    <div className='flex flex-1 flex-col gap-4'>
      {view === 'requests' && <SummaryCards data={data} />}
      {view !== 'orders' && (
        <div className='flex flex-wrap items-center gap-3'>
          {searchControl}
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
          {view !== 'customers' &&
            (view !== 'requests' || SHOW_LEGACY_REQUEST_FLOW) &&
            data.access?.role !== 'worker' && (
              <Button onClick={create}>
                <span className='flex items-center gap-2'>
                  <Icons.add aria-hidden />
                  {createLabel}
                </span>
              </Button>
            )}
        </div>
      )}
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
                  ? 'Тут зберігаються попередні заявки та їхня історія. Нові записи створюйте як замовлення.'
                  : 'Створіть замовлення. Воно почне роботу зі статусу «Створено».'}
            </EmptyDescription>
          </EmptyHeader>
          {data.access?.role !== 'worker' && (view !== 'requests' || SHOW_LEGACY_REQUEST_FLOW) && (
            <Button onClick={create}>
              <span className='flex items-center gap-2'>
                <Icons.add aria-hidden />
                {createLabel}
              </span>
            </Button>
          )}
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
          onSelectOrder={(order) =>
            setEditor({
              type: 'order',
              order,
              historyCustomer: editor.type === 'history' ? editor.customer : undefined
            })
          }
          onBackToHistory={(customer, vehicleId) =>
            setEditor({ type: 'history', customer, initialVehicleId: vehicleId })
          }
        />
      )}
    </div>
  );
  if (view === 'orders')
    return (
      <PageContainer
        pageTitle='Замовлення'
        pageHeaderLayout='responsive'
        pageDescription='Автомобілі в роботі, перелік робіт і вартість за позиціями.'
        pageHeaderAction={
          <div className='flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto'>
            {searchControl}
            {data.access?.role !== 'worker' && data.requests.length > 0 && (
              <Link href='/dashboard/requests' className={buttonVariants({ variant: 'ghost' })}>
                Архів заявок
              </Link>
            )}
            <DropdownMenu open={statusMenuOpen} onOpenChange={setStatusMenuOpen}>
              <DropdownMenuTrigger
                render={<HeaderButton variant='outline' aria-label='Фільтр статусу замовлень' />}
              >
                <Icons.adjustments aria-hidden />
                {params.orderStatus === 'all' ? 'Усі статуси' : statusLabel(params.orderStatus)}
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-max min-w-48 whitespace-nowrap'>
                <DropdownMenuRadioGroup value={params.orderStatus}>
                  {(['all', 'created', 'in_progress', 'ready'] as const).map((status) => (
                    <DropdownMenuRadioItem
                      key={status}
                      value={status}
                      onClick={() => {
                        void setParams({ orderStatus: status, page: 1 });
                        setStatusMenuOpen(false);
                      }}
                    >
                      {status === 'all' ? 'Усі статуси' : statusLabel(status)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {data.access?.role !== 'worker' && (
              <HeaderButton onClick={create} className='shrink-0'>
                <Icons.add aria-hidden />
                Нове замовлення
              </HeaderButton>
            )}
          </div>
        }
      >
        {content}
      </PageContainer>
    );
  return view === 'customers' ? (
    <PageContainer
      pageTitle='Клієнти'
      pageDescription='Контакти клієнтів і закріплені за ними автомобілі.'
      pageHeaderAction={
        <ButtonGroup aria-label='Дії сторінки клієнтів' className='gap-2'>
          <ButtonGroup>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <HeaderButton
                    variant='outline'
                    size='icon'
                    aria-label='Сортувати за датою створення'
                    title='Сортувати за датою створення'
                  />
                }
              >
                <Icons.calendar aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-max min-w-48 whitespace-nowrap'>
                <DropdownMenuRadioGroup value={params.customerOrder}>
                  <DropdownMenuRadioItem
                    value='newest'
                    onClick={() => void setParams({ customerOrder: 'newest', page: 1, sort: null })}
                  >
                    <Icons.chevronsDown aria-hidden />
                    Спочатку нові
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem
                    value='oldest'
                    onClick={() => void setParams({ customerOrder: 'oldest', page: 1, sort: null })}
                  >
                    <Icons.chevronUp aria-hidden />
                    Спочатку старі
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
          <ButtonGroup>
            <HeaderButton onClick={create} aria-label='Додати клієнта'>
              <Icons.add aria-hidden />
              <span className='hidden sm:inline'>Додати клієнта</span>
            </HeaderButton>
          </ButtonGroup>
        </ButtonGroup>
      }
    >
      {content}
    </PageContainer>
  ) : (
    content
  );
}
