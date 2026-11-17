import React from 'react';
import { cn } from '@/lib/utils';
import { Heading } from '../ui/heading';
import type { InfobarContent } from '@/components/ui/infobar';

function PageSkeleton() {
  return (
    <div
      role='status'
      aria-label='Loading page'
      className='flex flex-1 animate-pulse flex-col gap-4 p-4 md:px-6'
    >
      <div className='flex items-center justify-between'>
        <div>
          <div className='bg-muted mb-2 h-8 w-48 rounded' />
          <div className='bg-muted h-4 w-96 rounded' />
        </div>
      </div>
      <div className='bg-muted mt-6 h-40 w-full rounded-lg' />
      <div className='bg-muted h-40 w-full rounded-lg' />
    </div>
  );
}

export default function PageContainer({
  children,
  isLoading = false,
  access = true,
  accessFallback,
  pageTitle,
  pageDescription,
  infoContent,
  pageHeaderAction,
  pageHeaderLayout = 'inline'
}: {
  children: React.ReactNode;
  isLoading?: boolean;
  access?: boolean;
  accessFallback?: React.ReactNode;
  pageTitle?: string;
  pageDescription?: string;
  infoContent?: InfobarContent;
  pageHeaderAction?: React.ReactNode;
  pageHeaderLayout?: 'inline' | 'responsive';
}) {
  if (!access) {
    return (
      <div role='status' className='flex flex-1 items-center justify-center p-4 md:px-6'>
        {accessFallback ?? (
          <div className='text-muted-foreground text-center text-lg'>
            You do not have access to this page.
          </div>
        )}
      </div>
    );
  }

  const content = isLoading ? <PageSkeleton /> : children;

  const hasHeader = pageTitle || pageHeaderAction;

  return (
    <div className='flex min-w-0 flex-1 flex-col px-4 pt-2 pb-4 md:px-6 md:pt-4'>
      {hasHeader && (
        <div
          className={cn(
            'mb-4 flex items-start justify-between gap-4',
            pageHeaderLayout === 'responsive' && 'flex-col sm:flex-row sm:flex-wrap'
          )}
        >
          <div
            className={cn(
              'min-w-0 flex-1',
              pageHeaderLayout === 'responsive' && 'w-full sm:basis-52'
            )}
          >
            <Heading
              title={pageTitle ?? ''}
              description={pageDescription ?? ''}
              infoContent={infoContent}
            />
          </div>
          {pageHeaderAction && (
            <div
              className={cn(
                'min-w-0 shrink-0',
                pageHeaderLayout === 'responsive' && 'w-full max-w-full sm:w-auto'
              )}
            >
              {pageHeaderAction}
            </div>
          )}
        </div>
      )}
      {content}
    </div>
  );
}
