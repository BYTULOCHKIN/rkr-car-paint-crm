import type { Vehicle } from '../api/types';

const currency = new Intl.NumberFormat('uk-UA', { style: 'currency', currency: 'UAH' });
export function money(cents: number): string {
  return currency.format(cents / 100);
}
export function vehicleLabel(vehicle: Vehicle): string {
  return `${vehicle.make} ${vehicle.model}${vehicle.plate ? ` · ${vehicle.plate}` : ''}`;
}
