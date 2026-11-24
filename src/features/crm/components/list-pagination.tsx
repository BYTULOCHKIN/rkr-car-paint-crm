'use client';

import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import type { Pagination } from '../lib/pagination';

interface ListPaginationProps extends Pagination {
  total: number;
  pending?: boolean;
  onPage: (page: number) => void;
}

export function ListPagination({ page, pageSize, total, pending, onPage }: ListPaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav aria-label='Сторінки списку' className='flex flex-wrap items-center justify-end gap-3'>
      <span className='text-muted-foreground text-sm'>
        Сторінка {page} з {pages} · Усього: {total}
      </span>
      <Button
        variant='outline'
        size='icon'
        aria-label='Попередня сторінка'
        disabled={pending || page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <Icons.chevronLeft />
      </Button>
      <Button
        variant='outline'
        size='icon'
        aria-label='Наступна сторінка'
        disabled={pending || page >= pages}
        onClick={() => onPage(page + 1)}
      >
        <Icons.chevronRight />
      </Button>
    </nav>
  );
}
