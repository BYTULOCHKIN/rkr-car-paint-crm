'use client';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription
} from '@/components/ui/popover';
import type { StockTag } from '../constants/tags';
import { StockTagBadge } from './tag-badge';
import { cn } from '@/lib/utils';

interface StockItemTagsProps {
  tags: StockTag[];
  itemName: string;
  className?: string;
}

export function StockItemTags({ tags, itemName, className }: StockItemTagsProps) {
  if (!tags.length) return <span className='text-muted-foreground text-xs'>Без тегів</span>;
  const remaining = tags.slice(2);
  return (
    <div className={cn('flex w-60 flex-wrap items-center gap-1', className)}>
      {tags.slice(0, 2).map((tag) => (
        <StockTagBadge key={tag} tag={tag} />
      ))}
      {remaining.length > 0 && (
        <Popover>
          <PopoverTrigger
            aria-label={`Інші теги позиції ${itemName}`}
            render={<Button type='button' variant='ghost' size='icon-xs' />}
          >
            <Icons.dots />
          </PopoverTrigger>
          <PopoverContent
            align='start'
            className='max-h-(--available-height) max-w-[calc(100vw-2rem)] overflow-y-auto'
          >
            <PopoverHeader>
              <PopoverTitle>Інші теги</PopoverTitle>
              <PopoverDescription className='break-words whitespace-normal'>
                {itemName}
              </PopoverDescription>
            </PopoverHeader>
            <div className='flex flex-wrap gap-1'>
              {remaining.map((tag) => (
                <StockTagBadge key={tag} tag={tag} />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
