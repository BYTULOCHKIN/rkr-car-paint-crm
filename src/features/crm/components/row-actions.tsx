'use client';

import type { ReactElement } from 'react';
import { Icons } from '@/components/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from './action-button';

interface RowAction {
  icon?: keyof typeof Icons;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  description?: string;
  variant?: 'default' | 'destructive';
}

interface RowActionsProps {
  label: string;
  actions: RowAction[];
}

export function RowActions({ label, actions }: RowActionsProps): ReactElement {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger render={<Button size='icon-sm' variant='ghost' aria-label={label} />}>
        <Icons.ellipsis aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuGroup>
          {actions.map((action) => {
            const Icon = action.icon ? Icons[action.icon] : undefined;
            return (
              <DropdownMenuItem
                key={action.label}
                onClick={action.onClick}
                disabled={action.disabled}
                variant={action.variant}
                aria-label={action.label}
                aria-description={action.description}
              >
                {Icon && <Icon aria-hidden />}
                <span className='flex min-w-0 flex-col gap-1'>
                  <span>{action.label}</span>
                  {action.description && (
                    <span className='max-w-64 text-xs text-muted-foreground whitespace-normal'>
                      {action.description}
                    </span>
                  )}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
