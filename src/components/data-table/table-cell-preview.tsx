'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icons } from '@/components/icons';
import { Popover, PopoverTrigger, PopoverContent, PopoverTitle } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface TableCellPopoverProps {
  label: string;
  summary: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  className?: string;
}

export function TableCellPopover({ label, summary, children, className }: TableCellPopoverProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          'flex min-h-6 w-full min-w-0 items-center gap-1 rounded text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
      >
        <span className='min-w-0 flex-1'>{summary}</span>
        <Icons.chevronDown className='size-3 shrink-0 text-muted-foreground' aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='max-h-[min(28rem,var(--available-height))] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain p-4'
      >
        <PopoverTitle>{label}</PopoverTitle>
        {typeof children === 'function' ? children(() => setOpen(false)) : children}
      </PopoverContent>
    </Popover>
  );
}

interface OverflowTextProps {
  text: string;
  label?: string;
  className?: string;
}

/** Measure after layout; short values remain plain text, clipped values gain a keyboard/touch trigger. */
export function OverflowText({ text, label = 'Повний текст', className }: OverflowTextProps) {
  const container = useRef<HTMLDivElement>(null);
  const value = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const measure = () => {
      if (value.current && container.current)
        setClipped(Boolean(text) && value.current.scrollWidth > container.current.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [text]);
  const summary = (
    <span ref={value} className='block min-w-0 truncate'>
      {text || '—'}
    </span>
  );
  return (
    <div ref={container} className={cn('min-w-0 max-w-full', className)}>
      {clipped ? (
        <TableCellPopover label={label} summary={summary}>
          <p className='whitespace-pre-wrap break-words [overflow-wrap:anywhere] select-text'>
            {text}
          </p>
        </TableCellPopover>
      ) : (
        summary
      )}
    </div>
  );
}
