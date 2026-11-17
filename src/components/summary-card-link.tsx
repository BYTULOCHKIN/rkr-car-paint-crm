import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface SummaryCardLinkProps {
  href: ComponentProps<typeof Link>['href'];
  label: string;
  className?: string;
  children: ReactNode;
}

/** Keep the link's hit area still while its non-interactive surface moves. */
export function SummaryCardLink({ href, label, className, children }: SummaryCardLinkProps) {
  return (
    <Link
      href={href}
      aria-label={label}
      data-slot='summary-card-link'
      className='group/summary-card block min-w-0 cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
    >
      <Card
        className={cn(
          'pointer-events-none relative h-full min-w-0 bg-gradient-to-t from-primary/5 to-card shadow-xs motion-safe:transition-transform motion-safe:duration-350 motion-safe:ease-[cubic-bezier(.34,1.8,.64,1)] motion-safe:group-hover/summary-card:-translate-y-0.5 motion-safe:group-focus-visible/summary-card:-translate-y-0.5 motion-safe:group-active/summary-card:translate-y-0 motion-safe:group-active/summary-card:scale-[0.98] motion-safe:group-active/summary-card:duration-150 motion-safe:group-active/summary-card:ease-out',
          className
        )}
      >
        {children}
      </Card>
    </Link>
  );
}
