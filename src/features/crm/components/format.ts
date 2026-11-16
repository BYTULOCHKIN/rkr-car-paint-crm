import type { Vehicle } from '../api/types';

export function money(cents: number): string {
  // ICU versions use different UAH symbols; keep SSR and browser output identical.
  const [whole, fraction] = (cents / 100).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return `${grouped},${fraction}\u00a0грн`;
}
export function vehicleLabel(vehicle: Vehicle): string {
  return `${vehicle.make} ${vehicle.model}${vehicle.plate ? ` · ${vehicle.plate}` : ''}`;
}
