'use client';

import type { ReactNode } from 'react';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter
} from '@/components/ui/card';
import type { StockItem } from '../api/types';
import { StockItemAvailability } from './stock-item-availability';
import { StockItemTags } from './stock-item-tags';
import { StockItemSummary } from './stock-item-summary';

interface StockItemCardsProps {
  items: StockItem[];
  actions: (item: StockItem) => ReactNode;
  onDetails: (item: StockItem) => void;
}

export function StockItemCards({ items, actions, onDetails }: StockItemCardsProps) {
  return (
    <ul
      aria-label='Складські позиції — картки'
      className='grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
    >
      {items.map((item) => (
        <li key={item.id} className='flex min-w-0'>
          <Card className='min-w-0 flex-1 gap-4 pt-0'>
            <div className='relative aspect-[4/3] overflow-hidden bg-muted'>
              <div
                role='img'
                aria-label='Зображення відсутнє'
                className='text-muted-foreground flex size-full flex-col items-center justify-center gap-3 p-4'
              >
                <Icons.media aria-hidden className='size-14 opacity-40' />
                <span aria-hidden className='text-xs'>
                  Зображення відсутнє
                </span>
              </div>
              <div className='absolute top-3 left-3'>
                <StockItemAvailability item={item} />
              </div>
            </div>
            <CardHeader>
              <CardTitle>
                <h3 className='break-words [overflow-wrap:anywhere]'>{item.name}</h3>
              </CardTitle>
              <CardAction>{actions(item)}</CardAction>
              <CardDescription>
                <StockItemTags
                  tags={item.tags}
                  itemName={item.name}
                  className='w-auto min-w-0 pt-1'
                />
              </CardDescription>
            </CardHeader>
            <CardContent className='mt-auto flex flex-col gap-3'>
              {item.notes && (
                <p
                  className='text-muted-foreground line-clamp-2 text-xs break-words [overflow-wrap:anywhere]'
                  title={item.notes}
                >
                  {item.notes}
                </p>
              )}
              <StockItemSummary item={item} />
            </CardContent>
            <CardFooter>
              <Button
                type='button'
                variant='outline'
                className='w-full'
                aria-label={`Деталі позиції ${item.name}`}
                onClick={() => onDetails(item)}
              >
                Деталі
              </Button>
            </CardFooter>
          </Card>
        </li>
      ))}
    </ul>
  );
}
