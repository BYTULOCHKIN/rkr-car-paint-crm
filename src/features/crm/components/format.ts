import type { Vehicle } from '../api/types';

export { money } from '../lib/format';

export function vehicleLabel(vehicle: Vehicle): string {
  return `${vehicle.make} ${vehicle.model}${vehicle.plate ? ` · ${vehicle.plate}` : ''}`;
}
