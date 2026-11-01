'use client';

import { useId, type ReactElement } from 'react';
import type { ColumnDef, ReactTable } from '@tanstack/react-table';
import { DataTable } from '@/components/data-table/data-table';
import { useDataTable } from '@/hooks/use-data-table';
import type { DataTableFeatures } from '@/lib/data-table-features';
import { Icons } from '@/components/icons';
import { CHOICE_POPUP_CLASS_NAME } from '@/components/forms/fields/choice-options';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from './action-button';

interface CrmPaginationProps<T extends object> {
  table: ReactTable<DataTableFeatures, T, unknown>;
}

function CrmPagination<T extends object>({ table }: CrmPaginationProps<T>): ReactElement {
  const labelId = useId();
  return (
    <table.Subscribe selector={(state) => state.pagination}>
      {({ pageIndex, pageSize }) => (
        <div className='flex flex-wrap items-center justify-between gap-3 text-sm'>
          <p role='status' className='text-muted-foreground'>
            {table.getRowCount()
              ? `${pageIndex * pageSize + 1}–${Math.min((pageIndex + 1) * pageSize, table.getRowCount())} із ${table.getRowCount()}`
              : 'Записів не знайдено'}
          </p>
          <div className='flex items-center gap-3'>
            <div className='hidden items-center gap-2 sm:flex'>
              <span id={labelId} className='text-muted-foreground'>
                На сторінці
              </span>
              <Select
                value={String(pageSize)}
                onValueChange={(value) => {
                  if (value) table.setPageSize(Number(value));
                }}
              >
                <SelectTrigger className='w-18' aria-labelledby={labelId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent
                  side='top'
                  alignItemWithTrigger={false}
                  className={CHOICE_POPUP_CLASS_NAME}
                >
                  <SelectGroup>
                    {[10, 20, 50].map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <span className='tabular-nums'>
              {pageIndex + 1} / {Math.max(1, table.getPageCount())}
            </span>
            <div className='flex gap-1'>
              <Button
                size='icon-sm'
                variant='outline'
                aria-label='Попередня сторінка'
                disabled={!table.getCanPreviousPage()}
                onClick={() => table.previousPage()}
              >
                <Icons.chevronLeft />
              </Button>
              <Button
                size='icon-sm'
                variant='outline'
                aria-label='Наступна сторінка'
                disabled={!table.getCanNextPage()}
                onClick={() => table.nextPage()}
              >
                <Icons.chevronRight />
              </Button>
            </div>
          </div>
        </div>
      )}
    </table.Subscribe>
  );
}

interface CrmTableProps<T extends { id: string }> {
  rows: T[];
  columns: ColumnDef<DataTableFeatures, T>[];
  label: string;
}

export function CrmTable<T extends { id: string }>({
  rows,
  columns,
  label
}: CrmTableProps<T>): ReactElement {
  const { table } = useDataTable({
    data: rows,
    columns,
    mode: 'client',
    getRowId: (row) => row.id,
    initialState: { columnPinning: { start: [], end: ['actions'] } }
  });
  return (
    <div className='flex min-h-[28rem] min-w-0 flex-1 flex-col'>
      <DataTable
        table={table}
        aria-label={label}
        emptyMessage='За цим пошуком записів не знайдено.'
        pagination={<CrmPagination table={table} />}
        className='min-w-0 [&_table]:table-fixed [&_td]:px-3 [&_td]:py-3 [&_th]:px-3'
      />
    </div>
  );
}
