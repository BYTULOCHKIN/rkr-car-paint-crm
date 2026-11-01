'use client';
import { toast } from 'sonner';
import { Icons } from '@/components/icons';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import type { CrmWorkspace, Vehicle } from '../api/types';
import type { Editor } from './editor-dialog';
import { Button } from './action-button';

interface VehicleActionsProps {
  vehicle: Vehicle;
  data: CrmWorkspace;
  edit: (editor: Editor) => void;
}

export function VehicleActions({ vehicle, data, edit }: VehicleActionsProps) {
  const linked =
    data.requests.some((request) => request.vehicleId === vehicle.id) ||
    data.orders.some((order) => order.vehicleId === vehicle.id);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={`Дії з авто ${vehicle.make} ${vehicle.model}`}
          />
        }
      >
        <Icons.ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => edit({ type: 'vehicleDetails', vehicle })}>
            <Icons.info />
            Картка та історія
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => edit({ type: 'vehicle', vehicle })}>
            <Icons.edit />
            Редагувати
          </DropdownMenuItem>
          {!vehicle.customerId && (
            <DropdownMenuItem onClick={() => edit({ type: 'owner', vehicle })}>
              Закріпити клієнта
            </DropdownMenuItem>
          )}
          {vehicle.vin && (
            <DropdownMenuItem
              onClick={() => {
                void navigator.clipboard
                  .writeText(vehicle.vin!)
                  .then(() => toast.success('VIN скопійовано'))
                  .catch(() => toast.error('Не вдалося скопіювати VIN'));
              }}
            >
              Скопіювати VIN
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={linked}
            onClick={() => edit({ type: 'deleteVehicle', vehicle })}
          >
            <Icons.trash />
            {linked ? 'Видалення недоступне — є історія' : 'Видалити'}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
