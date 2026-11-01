'use client';

/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- This named scroll region supports native keyboard scrolling. */

import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { Icons } from '@/components/icons';
import { Button } from './action-button';

interface BoardViewportProps {
  children: ReactNode;
}

export function BoardViewport({ children }: BoardViewportProps): ReactElement {
  const viewportRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    function updateEdges(): void {
      if (!viewport) return;
      const left = viewport.scrollLeft > 1;
      const right = viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1;
      setEdges((previous) =>
        previous.left === left && previous.right === right ? previous : { left, right }
      );
    }
    const observer = new ResizeObserver(updateEdges);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    viewport.addEventListener('scroll', updateEdges, { passive: true });
    updateEdges();
    return () => {
      observer.disconnect();
      viewport.removeEventListener('scroll', updateEdges);
    };
  }, []);

  function scroll(direction: number): void {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollBy({
      left: direction * Math.max(240, viewport.clientWidth - 48),
      behavior: 'instant'
    });
  }

  return (
    <div className='flex min-w-0 flex-col gap-2'>
      <div className='flex items-center justify-between gap-3'>
        <p id={labelId} className='text-muted-foreground text-xs'>
          Перегляд статусів
        </p>
        <div className='flex shrink-0 gap-1'>
          <Button
            size='icon-sm'
            variant='outline'
            aria-label='Прокрутити дошку ліворуч'
            title='Попередні колонки'
            disabled={!edges.left}
            onClick={() => scroll(-1)}
          >
            <Icons.chevronLeft />
          </Button>
          <Button
            size='icon-sm'
            variant='outline'
            aria-label='Прокрутити дошку праворуч'
            title='Наступні колонки'
            disabled={!edges.right}
            onClick={() => scroll(1)}
          >
            <Icons.chevronRight />
          </Button>
        </div>
      </div>
      <div
        ref={viewportRef}
        data-slot='crm-board-scroll'
        role='region'
        aria-label='Статуси дошки робіт'
        aria-describedby={labelId}
        tabIndex={0}
        className='h-[clamp(20rem,65dvh,40rem)] w-full min-w-0 overflow-x-auto overflow-y-hidden rounded-lg pb-3 outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-[clamp(20rem,calc(100dvh-27rem),44rem)]'
      >
        {children}
      </div>
    </div>
  );
}
