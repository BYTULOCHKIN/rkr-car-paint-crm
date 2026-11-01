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
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface RowActionsProps {
  label: string;
  actions: RowAction[];
}

export function RowActions({ label, actions }: RowActionsProps): ReactElement {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger render={<Button size='icon-sm' variant='ghost' aria-label={label} />}>
        <Icons.ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuGroup>
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.label}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
