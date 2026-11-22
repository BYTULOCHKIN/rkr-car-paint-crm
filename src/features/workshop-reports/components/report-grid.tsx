'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableCaption
} from '@/components/ui/table';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';

export interface ReportColumn<T> {
  id: string;
  title: ReactNode;
  cell: (row: T) => ReactNode;
}
export function ReportGrid<T>({
  label,
  rows,
  columns,
  rowKey
}: {
  label: string;
  rows: T[];
  columns: ReportColumn<T>[];
  rowKey: (row: T) => string;
}) {
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / pageSize) - 1));
  if (!rows.length)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Немає записів</EmptyTitle>
          <EmptyDescription>{label}: за вибраними датами даних немає.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div className='flex min-w-0 flex-col gap-3'>
      <Table aria-label={label}>
        <TableCaption>
          {label} · {rows.length} рядків. Грошові суми — гривні.
        </TableCaption>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.id}>{column.title}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((column) => (
                <TableCell key={column.id}>{column.cell(row)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > pageSize && (
        <div className='flex flex-wrap items-center justify-end gap-2'>
          <p className='text-muted-foreground text-sm'>
            Сторінка {currentPage + 1} із {Math.ceil(rows.length / pageSize)}. CSV містить усі
            рядки.
          </p>
          <Button
            variant='outline'
            size='sm'
            disabled={!currentPage}
            onClick={() => setPage(currentPage - 1)}
          >
            Попередня сторінка
          </Button>
          <Button
            variant='outline'
            size='sm'
            disabled={(currentPage + 1) * pageSize >= rows.length}
            onClick={() => setPage(currentPage + 1)}
          >
            Наступна сторінка
          </Button>
        </div>
      )}
    </div>
  );
}
