'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { money } from '@/features/crm/lib/format';
import { statusLabel } from '@/features/crm/lib/workflow';
import { historyTimestamp } from '@/features/crm/lib/workflow-history';
import { stockQuantity } from '@/features/inventory/lib/format';
import type {
  EconomicsTotals,
  PeriodReport,
  ReportOrder,
  PostingReportRow,
  CashReportRow,
  OrderReportRow,
  MaterialReportRow
} from '../api/types';
import { ReportGrid, type ReportColumn } from './report-grid';

export { SettlementsSection } from './settlements-section';

function orderCell(order: ReportOrder) {
  return (
    <div className='flex max-w-64 flex-col gap-1 whitespace-normal'>
      <strong>№{order.number}</strong>
      <span>{order.vehicle}</span>
    </div>
  );
}
function economicsColumns<T>(get: (row: T) => EconomicsTotals | null): ReportColumn<T>[] {
  return (
    [
      ['checkCents', 'Чек'],
      ['materialsCents', 'Матеріали'],
      ['employeeAccrualsCents', 'Працівникам'],
      ['subcontractCostsCents', 'Субпідряд'],
      ['workshopRemainderCents', 'Залишок після прямих витрат']
    ] as const
  ).map(([id, title]) => ({
    id,
    title,
    cell: (row: T) => {
      const value = get(row);
      return value ? money(value[id]) : 'Не визначено';
    }
  }));
}
const postingColumns: ReportColumn<PostingReportRow>[] = [
  { id: 'date', title: 'Проведено', cell: (row) => historyTimestamp(row.createdAt) },
  { id: 'order', title: 'Авто', cell: (row) => orderCell(row.order) },
  {
    id: 'kind',
    title: 'Розрахунок',
    cell: (row) => (
      <div className='flex flex-col gap-1'>
        <Badge variant='outline'>{row.kind === 'initial' ? 'Початковий' : 'Коригування'}</Badge>
        <span>Версія {row.revision}</span>
      </div>
    )
  },
  ...economicsColumns((row: PeriodReport['postings'][number]) => row.delta),
  {
    id: 'note',
    title: 'Підстава',
    cell: (row) => (
      <div className='max-w-72 whitespace-normal'>
        <p>{row.note}</p>
        <p className='text-muted-foreground'>{row.actor.name}</p>
      </div>
    )
  }
];

const cashColumns: ReportColumn<CashReportRow>[] = [
  { id: 'date', title: 'Дата', cell: (row) => historyTimestamp(row.createdAt) },
  { id: 'order', title: 'Авто', cell: (row) => orderCell(row.order) },
  {
    id: 'kind',
    title: 'Операція',
    cell: (row) =>
      ({
        payment: 'Оплата',
        reversal: 'Скасування оплати',
        refund: 'Повернення клієнту',
        refund_reversal: 'Скасування запису повернення'
      })[row.kind]
  },
  { id: 'amount', title: 'Рух коштів (±)', cell: (row) => money(row.amountCents) },
  {
    id: 'note',
    title: 'Примітка',
    cell: (row) => <span className='inline-block max-w-72 whitespace-normal'>{row.note}</span>
  }
];

const orderColumns: ReportColumn<OrderReportRow>[] = [
  { id: 'order', title: 'Авто', cell: orderCell },
  { id: 'customer', title: 'Клієнт', cell: (row) => row.customer },
  { id: 'date', title: 'Дата відбору', cell: (row) => row.date },
  { id: 'status', title: 'Статус зараз', cell: (row) => statusLabel(row.status) },
  {
    id: 'revision',
    title: 'Розрахунок',
    cell: (row) => (row.revision ? `Версія ${row.revision}` : 'Без проведення')
  },
  ...economicsColumns((row: PeriodReport['orders'][number]) => row.economics)
];

function materialColumns(orders: ReportOrder[]): ReportColumn<MaterialReportRow>[] {
  return [
    {
      id: 'material',
      title: 'Матеріал',
      cell: (row) => (
        <div className='max-w-56 whitespace-normal'>
          <strong>{row.name}</strong>
          <p>{row.unit}</p>
          {row.unknownMovements > 0 && (
            <Badge variant='outline'>Без оцінки: {row.unknownMovements}</Badge>
          )}
        </div>
      )
    },
    ...orders.map((order) => ({
      id: order.id,
      title: (
        <span title={order.vehicle}>
          №{order.number} · {order.vehicle}
        </span>
      ),
      cell: (row: PeriodReport['materials']['rows'][number]) => {
        const cell = row.cells[order.id];
        return cell ? (
          <div>
            <p>
              {stockQuantity(cell.quantityMilli)} {row.unit}
            </p>
            <p className='text-muted-foreground'>
              {cell.costCents === null ? 'Не визначено' : money(cell.costCents)}
            </p>
          </div>
        ) : (
          '—'
        );
      }
    })),
    {
      id: 'total',
      title: 'Разом',
      cell: (row) => (
        <div className='font-medium'>
          <p>
            {stockQuantity(row.quantityMilli)} {row.unit}
          </p>
          <p>{row.costCents === null ? 'Не визначено' : money(row.costCents)}</p>
        </div>
      )
    }
  ];
}

export function ReportMetrics({ report }: { report: PeriodReport }) {
  if (!report.economics) return null;
  const totals = report.economics;
  return (
    <section
      aria-label='Підсумок проведень за період'
      className='grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3'
    >
      {(
        [
          ['Проведений чек', totals.checkCents, 'Початкові розрахунки та різниця коригувань'],
          ['Матеріали в розрахунках', totals.materialsCents, 'Собівартість у проведеній економіці'],
          [
            'Нараховано працівникам',
            totals.employeeAccrualsCents,
            'Винагороди з урахуванням коригувань'
          ],
          [
            'Нараховано підрядникам',
            totals.subcontractCostsCents,
            'Колорист, пайка та інший субпідряд'
          ],
          [
            'Залишок після прямих витрат',
            totals.workshopRemainderCents,
            'Без загальних витрат автомалярки; не чистий прибуток'
          ],
          [
            'Рух клієнтських коштів',
            report.cash!.netCents,
            'Оплати мінус повернення, зі скасуваннями за датою запису'
          ]
        ] as const
      ).map(([label, amount, description]) => (
        <Card key={label}>
          <CardHeader>
            <CardTitle>{label}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='break-words text-xl font-semibold tabular-nums'>{money(amount)}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

export function PostingsSection({ report }: { report: PeriodReport }) {
  return (
    <section aria-label='Проведення економіки' className='flex min-w-0 flex-col gap-4'>
      <p className='text-muted-foreground text-sm'>
        Проведення відібрані за датою запису в Києві. Коригування показує тільки різницю з
        попередньою версією, навіть якщо початкова версія була в іншому періоді. Оплата клієнта й
        виплата працівнику не змінюють економічний залишок повторно.
      </p>
      <ReportMetrics report={report} />
      <ReportGrid
        label='Журнал проведень економіки'
        rows={report.postings}
        rowKey={(row) => row.id}
        columns={postingColumns}
      />
      <h3 className='font-semibold'>Клієнтські кошти</h3>
      <p className='text-muted-foreground text-sm'>
        Оплати, фактичні повернення та скасування враховані за власною датою запису. Скасування в
        наступному місяці не переписує попередній місяць цього звіту.
      </p>
      <ReportGrid
        label='Рух клієнтських коштів'
        rows={report.cash?.rows ?? []}
        rowKey={(row) => row.id}
        columns={cashColumns}
      />
    </section>
  );
}

export function OrdersSection({ report }: { report: PeriodReport }) {
  return (
    <section aria-label='Економіка авто за період' className='flex min-w-0 flex-col gap-3'>
      <p className='text-muted-foreground text-sm'>
        Відбір за поточною датою готовності, створення або видачі замовлення. Суми — з останньої
        проведеної версії станом на кінець вибраного періоду. Для авто без проведення значення не
        визначені. Фільтр авто не змінює інші вкладки.
      </p>
      <ReportGrid
        label='Авто за вибраними датами'
        rows={report.orders}
        rowKey={(row) => row.id}
        columns={orderColumns}
      />
    </section>
  );
}

export function MaterialsSection({ report }: { report: PeriodReport }) {
  return (
    <section aria-label='Матриця матеріалів та авто' className='flex min-w-0 flex-col gap-3'>
      <p className='text-muted-foreground text-sm'>
        Списання мінус повернення за датою складського руху в Києві, незалежно від готовності авто.
        Повернення в іншому періоді має від'ємні кількість і вартість. Невідома стара собівартість
        позначена явно. Кожна клітинка: кількість та вартість.
      </p>
      <ReportGrid
        label='Матеріали × авто'
        rows={report.materials.rows}
        rowKey={(row) => row.id}
        columns={materialColumns(report.materials.orders)}
      />
    </section>
  );
}
