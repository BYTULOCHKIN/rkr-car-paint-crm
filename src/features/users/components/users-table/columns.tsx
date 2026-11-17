'use client';
import { Badge } from '@/components/ui/badge';
import { OverflowText } from '@/components/data-table/table-cell-preview';
import { PersonAvatar } from '@/components/person-avatar';
import { DataTableColumnHeader } from '@/components/data-table/data-table-column-header';
import type { User } from '../../api/types';
import type { ColumnDef } from '@tanstack/react-table';
import type { DataTableFeatures } from '@/lib/data-table-features';
import { Icons } from '@/components/icons';
import { CellAction } from './cell-action';
import { ROLE_OPTIONS } from './options';

export const columns: ColumnDef<DataTableFeatures, User>[] = [
  {
    id: 'name',
    accessorFn: (row) => `${row.first_name} ${row.last_name}`,
    header: ({ column }) => <DataTableColumnHeader column={column} label='Name' />,
    cell: ({ row }) => (
      <div className='flex min-w-0 items-center gap-3'>
        <PersonAvatar
          identity={`user:${row.original.id}`}
          name={`${row.original.first_name} ${row.original.last_name}`}
          imageUrl={row.original.imageUrl}
        />
        <div className='flex min-w-0 flex-col'>
          <OverflowText
            text={`${row.original.first_name} ${row.original.last_name}`}
            className='font-medium'
          />
          <OverflowText text={row.original.email} className='text-muted-foreground text-xs' />
        </div>
      </div>
    ),
    meta: {
      label: 'Name',
      placeholder: 'Search users...',
      variant: 'text' as const,
      icon: Icons.text
    },
    enableColumnFilter: true
  },
  {
    accessorKey: 'phone',
    header: 'PHONE'
  },
  {
    id: 'role',
    accessorKey: 'role',
    enableSorting: false,
    header: ({ column }) => <DataTableColumnHeader column={column} label='Role' />,
    cell: ({ cell }) => {
      return (
        <Badge variant='outline' className='capitalize'>
          {cell.getValue<User['role']>()}
        </Badge>
      );
    },
    enableColumnFilter: true,
    meta: {
      label: 'roles',
      variant: 'multiSelect' as const,
      options: ROLE_OPTIONS
    }
  },
  {
    accessorKey: 'status',
    header: 'STATUS',
    cell: ({ cell }) => {
      const status = cell.getValue<User['status']>();
      const variant =
        status === 'Active' ? 'default' : status === 'Inactive' ? 'secondary' : 'outline';
      return <Badge variant={variant}>{status}</Badge>;
    }
  },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction data={row.original} />
  }
];
