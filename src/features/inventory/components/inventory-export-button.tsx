'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/features/crm/components/action-button';
import { businessToday } from '@/features/crm/lib/workflow';
import type { StockItem } from '../api/types';

interface InventoryExportButtonProps {
  items: StockItem[];
  archived: boolean;
  disabled?: boolean;
  loadItems?: () => Promise<StockItem[]>;
}

export function InventoryExportButton({
  items,
  archived,
  disabled,
  loadItems
}: InventoryExportButtonProps) {
  const [pending, setPending] = useState(false);
  async function download(): Promise<void> {
    if (pending || disabled || !items.length) return;
    setPending(true);
    try {
      const { inventoryExcelFile } = await import('../lib/excel');
      const exported = loadItems ? await loadItems() : items;
      await inventoryExcelFile(exported).toFile(
        `sklad${archived ? '-archive' : ''}-${businessToday()}.xlsx`
      );
    } catch {
      toast.error('Не вдалося експортувати склад. Спробуйте ще раз.');
    } finally {
      setPending(false);
    }
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type='button'
            variant='outline'
            size='icon'
            aria-label='Експортувати склад в Excel'
            disabled={disabled || !items.length}
            isLoading={pending}
            onClick={() => void download()}
          />
        }
      >
        <Icons.fileTypeXls />
      </TooltipTrigger>
      <TooltipContent>Експортувати поточний список в Excel</TooltipContent>
    </Tooltip>
  );
}
