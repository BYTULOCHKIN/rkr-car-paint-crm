'use client';

import { useMemo, useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import type { DataTableFeatures } from '@/lib/data-table-features';
import { Input } from '@/components/ui/input';
import { crmQueries } from '../api/queries';
import type { Vehicle, CrmWorkspace } from '../api/types';
import { CrmEditorDialog, type Editor } from './editor-dialog';
import { Button } from './action-button';
import { VehicleActions } from './vehicle-actions';
import { CrmTable } from './crm-table';

function columnsFor(
  data: CrmWorkspace,
  edit: (editor: Editor) => void
): ColumnDef<DataTableFeatures, Vehicle>[] {
  return [
    {
      id: 'make',
      size: 160,
      accessorKey: 'make',
      header: ({ column }) => <DataTableColumnHeader column={column} label='Марка' />
    },
    {
      id: 'model',
      size: 200,
      accessorKey: 'model',
      header: 'Модель',
      cell: ({ row }) => (
        <p className='truncate font-medium' title={row.original.model}>
          {row.original.model}
        </p>
      )
    },
    {
      id: 'year',
      size: 90,
      accessorKey: 'year',
      header: 'Рік',
      cell: ({ row }) => row.original.year ?? 'Не вказано'
    },
    {
      id: 'vin',
      size: 210,
      accessorKey: 'vin',
      header: 'VIN',
      cell: ({ row }) => <span className='font-mono'>{row.original.vin || 'Не вказано'}</span>
    },
    {
      id: 'plate',
      size: 140,
      accessorKey: 'plate',
      header: 'Держномер',
      cell: ({ row }) =>
        row.original.plate || <span className='text-muted-foreground'>Не вказано</span>
    },
    {
      id: 'customer',
      size: 250,
      header: 'Клієнт',
      cell: ({ row }) => {
        const name =
          data.customers.find((customer) => customer.id === row.original.customerId)?.name ??
          'Без клієнта';
        return (
          <p className='truncate' title={name}>
            {name}
          </p>
        );
      }
    },
    {
      id: 'actions',
      size: 64,
      header: 'Дії',
      cell: ({ row }) => <VehicleActions vehicle={row.original} data={data} edit={edit} />
    }
  ];
}

export function VehiclesView({ userId }: { userId: string }) {
  const { data } = useSuspenseQuery(crmQueries.workspace(userId));
  const [editor, setEditor] = useState<Editor | null>(null);
  const [params, setParams] = useQueryStates(
    { q: parseAsString.withDefault(''), page: parseAsInteger.withDefault(1) },
    { shallow: true }
  );
  const search = params.q;
  const columns = useMemo(() => columnsFor(data, setEditor), [data]);
  const rows = useMemo(
    () =>
      data.vehicles.filter((vehicle) =>
        [
          vehicle.make,
          vehicle.model,
          vehicle.year,
          vehicle.vin,
          vehicle.plate,
          data.customers.find((customer) => customer.id === vehicle.customerId)?.name
        ]
          .join(' ')
          .toLocaleLowerCase('uk-UA')
          .includes(search.toLocaleLowerCase('uk-UA'))
      ),
    [data, search]
  );
  return (
    <div className='flex flex-1 flex-col gap-4'>
      <div className='flex flex-wrap gap-3'>
        <Input
          className='sm:max-w-sm'
          placeholder='Марка, модель, VIN, клієнт…'
          aria-label='Пошук автомобілів'
          value={search}
          onChange={(event) => {
            void setParams({ q: event.target.value, page: 1 });
          }}
        />
        <Button onClick={() => setEditor({ type: 'vehicle' })}>Додати автомобіль</Button>
      </div>
      <CrmTable rows={rows} columns={columns} label='Автомобілі' />
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
