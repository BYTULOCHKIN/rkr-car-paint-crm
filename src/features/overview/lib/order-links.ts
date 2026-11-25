import type { OverviewOrderMetric, OverviewPeriod } from '../schemas/period';

export const overviewMetricLabels: Record<OverviewOrderMetric, string> = {
  created_period: 'Створені за період',
  completed: 'Завершені замовлення',
  receipts: 'Замовлення з надходженнями',
  ready_debt: 'Борг за готовими авто',
  open_debt: 'До сплати за відкритими авто',
  profit: 'Прибуток фірми',
  unposted: 'Готові авто без розрахунку прибутку'
};
export function overviewOrdersLink(metric: OverviewOrderMetric, period: OverviewPeriod): string {
  return `/dashboard/orders?${new URLSearchParams({ overviewMetric: metric, overviewFrom: period.from, overviewTo: period.to })}`;
}
