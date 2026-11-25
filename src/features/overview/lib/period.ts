import { businessToday } from '@/features/crm/lib/workflow';
import type { OverviewPeriod } from '../schemas/period';

export function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
export function currentOverviewMonth(today: string): OverviewPeriod {
  return { from: `${today.slice(0, 7)}-01`, to: today };
}
export function previousOverviewMonth(today: string): OverviewPeriod {
  const last = shiftDay(`${today.slice(0, 7)}-01`, -1);
  return { from: `${last.slice(0, 7)}-01`, to: last };
}
export function periodDayCount(period: OverviewPeriod): number {
  return (
    Math.round(
      (Date.parse(`${period.to}T12:00:00Z`) - Date.parse(`${period.from}T12:00:00Z`)) / 86400000
    ) + 1
  );
}
export function comparisonPeriod(period: OverviewPeriod, today: string): OverviewPeriod {
  const monthly =
    period.from === `${period.to.slice(0, 7)}-01` &&
    (period.to === today || shiftDay(period.to, 1).slice(0, 7) !== period.to.slice(0, 7));
  if (monthly) {
    const previous = previousOverviewMonth(period.from);
    const fullMonth = shiftDay(period.to, 1).slice(0, 7) !== period.to.slice(0, 7);
    return {
      from: previous.from,
      to: fullMonth
        ? previous.to
        : `${previous.from.slice(0, 8)}${String(Math.min(Number(period.to.slice(-2)), Number(previous.to.slice(-2)))).padStart(2, '0')}`
    };
  }
  return { from: shiftDay(period.from, -periodDayCount(period)), to: shiftDay(period.from, -1) };
}
export function inPeriod(day: string | null | undefined, period: OverviewPeriod): boolean {
  return !!day && day >= period.from && day <= period.to;
}
export function timestampDay(timestamp: string): string | null {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  return businessToday(date);
}
