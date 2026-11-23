'use client';

import { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { money } from '@/features/crm/lib/format';
import { displayDate } from '@/features/crm/lib/workflow';
import { historyTimestamp } from '@/features/crm/lib/workflow-history';
import { sumIntegers } from '@/features/order-economics/lib/integers';
import { payeeKey } from '@/features/order-economics/lib/settlements';
import { accruedInPeriod, paidInPeriod, filterSettlementReport } from '../lib/settlements';
import { useSettlementFilters } from '../lib/use-settlement-filters';
import type {
  OrderSettlementRow,
  PayeeReportRow,
  PeriodReport,
  SettlementReportEvent,
  SettlementTotals
} from '../api/types';
import { ReportGrid, type ReportColumn } from './report-grid';

const kindOptions = [
  { value: 'all', label: 'Усі одержувачі' },
  { value: 'worker', label: 'Працівники' },
  { value: 'contractor', label: 'Підрядники' }
];

function balanceText(cents: number): string {
  if (cents > 0) return `${money(cents)} до виплати`;
  if (cents < 0) return `${money(-cents)} авансу / переплати`;
  return money(0);
}

function AccruedCell({ row }: { row: SettlementTotals }) {
  return (
    <div className='flex flex-col gap-1 tabular-nums'>
      <span>{money(accruedInPeriod(row))}</span>
      {row.adjustmentCents !== 0 && (
        <span className='text-xs text-muted-foreground'>
          Коригування: {money(row.adjustmentCents)}
        </span>
      )}
    </div>
  );
}

function PaidCell({ row }: { row: SettlementTotals }) {
  return (
    <div className='flex flex-col gap-1 tabular-nums'>
      <span>{money(paidInPeriod(row))}</span>
      {row.returnCents !== 0 && (
        <span className='text-xs text-muted-foreground'>Повернення: {money(row.returnCents)}</span>
      )}
      {row.reversalCents !== 0 && (
        <span className='text-xs text-muted-foreground'>
          Скасування, вплив на баланс: {money(row.reversalCents)}
        </span>
      )}
    </div>
  );
}

const orderColumns: ReportColumn<OrderSettlementRow>[] = [
  {
    id: 'order',
    title: 'Автомобіль',
    cell: (row) => (
      <div className='flex max-w-56 flex-col gap-1 whitespace-normal'>
        <strong>№{row.order.number}</strong>
        <span>{row.order.vehicle}</span>
      </div>
    )
  },
  {
    id: 'opening',
    title: 'На початок',
    cell: (row) => (
      <span className='inline-block max-w-40 whitespace-normal tabular-nums'>
        {balanceText(row.openingCents)}
      </span>
    )
  },
  { id: 'accrued', title: 'Нараховано за період', cell: (row) => <AccruedCell row={row} /> },
  { id: 'paid', title: 'Виплати за період', cell: (row) => <PaidCell row={row} /> },
  {
    id: 'closing',
    title: 'На кінець',
    cell: (row) => (
      <strong className='inline-block max-w-40 whitespace-normal tabular-nums'>
        {balanceText(row.closingCents)}
      </strong>
    )
  }
];

const eventLabels: Record<SettlementReportEvent['kind'], string> = {
  accrual: 'Нарахування',
  adjustment: 'Коригування нарахування',
  payout: 'Виплата / аванс',
  return: 'Повернення коштів',
  reversal: 'Скасування запису'
};
const eventColumns: ReportColumn<SettlementReportEvent>[] = [
  { id: 'date', title: 'Дата', cell: (row) => historyTimestamp(row.createdAt) },
  { id: 'order', title: 'Авто', cell: (row) => `№${row.order.number}` },
  {
    id: 'kind',
    title: 'Операція',
    cell: (row) => (
      <span className='inline-block max-w-48 whitespace-normal'>{eventLabels[row.kind]}</span>
    )
  },
  {
    id: 'amount',
    title: 'Сума операції',
    cell: (row) => <span className='tabular-nums'>{money(row.amountCents)}</span>
  },
  {
    id: 'delta',
    title: 'Зміна балансу (±)',
    cell: (row) => <span className='tabular-nums'>{money(row.balanceDeltaCents)}</span>
  },
  {
    id: 'note',
    title: 'Підстава',
    cell: (row) => (
      <div className='max-w-64 whitespace-normal break-words'>
        <p>{row.note || '—'}</p>
        <p className='text-xs text-muted-foreground'>{row.actor.name}</p>
      </div>
    )
  }
];

function PayeeDetails({ row, report }: { row: PayeeReportRow; report: PeriodReport }) {
  const key = payeeKey(row.payee);
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type='button'
            aria-label={`Деталі розрахунків: ${row.payee.name}`}
            className='max-w-full rounded-sm text-left font-medium break-words underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring'
          />
        }
      >
        {row.payee.name}
      </DialogTrigger>
      <DialogContent className='flex max-h-[90dvh] min-w-0 flex-col sm:max-w-5xl'>
        <DialogHeader>
          <DialogTitle className='break-words pr-6'>Розрахунки — {row.payee.name}</DialogTitle>
          <DialogDescription>
            {displayDate(report.filters.from)} — {displayDate(report.filters.to)} включно. Усі суми
            — гривні.
          </DialogDescription>
        </DialogHeader>
        <div className='flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto overscroll-contain'>
          <dl className='grid grid-cols-2 gap-3 rounded-lg border p-3 sm:grid-cols-3'>
            {[
              ['На початок', balanceText(row.openingCents)],
              ['Нараховано за період', money(accruedInPeriod(row))],
              ['Виплати за період', money(paidInPeriod(row))],
              ['До виплати по авто', money(row.payableCents)],
              ['Аванси / переплати', money(row.advanceCents)],
              ['Загальний баланс на кінець', balanceText(row.closingCents)]
            ].map(([label, value]) => (
              <div key={label} className='flex min-w-0 flex-col gap-1'>
                <dt className='text-sm text-muted-foreground'>{label}</dt>
                <dd className='break-words font-semibold tabular-nums'>{value}</dd>
              </div>
            ))}
          </dl>
          <p className='text-sm text-muted-foreground'>
            Борг за одним авто та аванс за іншим показані окремо. Автоматичного заліку між
            замовленнями немає.
          </p>
          <Tabs defaultValue='orders' className='min-w-0'>
            <TabsList aria-label='Деталі розрахунків'>
              <TabsTrigger value='orders'>За автомобілями</TabsTrigger>
              <TabsTrigger value='events'>Історія операцій</TabsTrigger>
            </TabsList>
            <TabsContent value='orders' className='min-w-0'>
              <ReportGrid
                label='Баланси по авто'
                rows={report.settlements.orders.filter((entry) => payeeKey(entry.payee) === key)}
                columns={orderColumns}
                rowKey={(entry) => entry.order.id}
              />
            </TabsContent>
            <TabsContent value='events' className='min-w-0'>
              <ReportGrid
                label='Операції розрахунків'
                rows={report.settlements.events.filter((entry) => payeeKey(entry.payee) === key)}
                columns={eventColumns}
                rowKey={(entry) => entry.id}
              />
            </TabsContent>
          </Tabs>
          <details className='rounded-lg border p-3 text-sm'>
            <summary className='cursor-pointer font-medium'>Повний рух розрахунків</summary>
            <dl className='mt-3 grid grid-cols-2 gap-3'>
              {[
                ['Початковий баланс (±)', row.openingCents],
                ['Нарахування', row.accrualCents],
                ['Коригування (±)', row.adjustmentCents],
                ['Записані виплати', row.payoutCents],
                ['Повернення коштів', row.returnCents],
                ['Скасування: зміна балансу (±)', row.reversalCents],
                ['Кінцевий баланс (±)', row.closingCents]
              ].map(([label, amount]) => (
                <div key={label} className='flex min-w-0 flex-col gap-1'>
                  <dt className='text-muted-foreground'>{label}</dt>
                  <dd className='tabular-nums'>{money(amount as number)}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
        <DialogFooter>
          <DialogClose render={<Button type='button' />}>Закрити</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function payeeColumns(report: PeriodReport): ReportColumn<PayeeReportRow>[] {
  return [
    {
      id: 'payee',
      title: 'Одержувач',
      cell: (row) => (
        <div className='flex max-w-56 flex-col items-start gap-1 whitespace-normal break-words'>
          <PayeeDetails row={row} report={report} />
          <Badge variant='outline'>{row.payee.kind === 'worker' ? 'Працівник' : 'Підрядник'}</Badge>
        </div>
      )
    },
    { id: 'earned', title: 'Нараховано', cell: (row) => <AccruedCell row={row} /> },
    { id: 'paid', title: 'Виплати', cell: (row) => <PaidCell row={row} /> },
    {
      id: 'due',
      title: 'До виплати',
      cell: (row) => <strong className='tabular-nums'>{money(row.payableCents)}</strong>
    },
    {
      id: 'advance',
      title: 'Аванс / переплата',
      cell: (row) => <span className='tabular-nums'>{money(row.advanceCents)}</span>
    }
  ];
}

function MobilePayees({ report }: { report: PeriodReport }) {
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const pages = Math.ceil(report.settlements.payees.length / pageSize);
  const currentPage = Math.min(page, Math.max(0, pages - 1));
  return (
    <div className='flex flex-col gap-3 md:hidden'>
      {report.settlements.payees
        .slice(currentPage * pageSize, (currentPage + 1) * pageSize)
        .map((row) => (
          <Card
            key={payeeKey(row.payee)}
            size='sm'
            role='article'
            aria-label={`Розрахунки: ${row.payee.name}`}
          >
            <CardHeader>
              <CardTitle>
                <PayeeDetails row={row} report={report} />
              </CardTitle>
              <CardDescription>
                {row.payee.kind === 'worker' ? 'Працівник' : 'Підрядник'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className='grid grid-cols-2 gap-3'>
                {[
                  ['До виплати', row.payableCents],
                  ['Аванс / переплата', row.advanceCents],
                  ['Нараховано за період', accruedInPeriod(row)],
                  ['Виплати за період', paidInPeriod(row)]
                ].map(([label, amount]) => (
                  <div key={label} className='flex min-w-0 flex-col gap-1'>
                    <dt className='text-sm text-muted-foreground'>{label}</dt>
                    <dd className='break-words font-medium tabular-nums'>
                      {money(amount as number)}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        ))}
      {pages > 1 && (
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <p className='text-sm text-muted-foreground'>
            Сторінка {currentPage + 1} із {pages}
          </p>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={!currentPage}
            onClick={() => setPage(currentPage - 1)}
          >
            Назад
          </Button>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={currentPage + 1 >= pages}
            onClick={() => setPage(currentPage + 1)}
          >
            Далі
          </Button>
        </div>
      )}
    </div>
  );
}

export function SettlementsSection({ report }: { report: PeriodReport }) {
  const [filters, setFilters] = useSettlementFilters();
  const worker = report.access.role === 'worker';
  const scoped = filterSettlementReport(report, {
    search: filters.settlementSearch,
    kind: filters.settlementKind
  });
  const rows = scoped.settlements.payees;
  const searchId = useId();
  const kindId = useId();
  const total = (read: (row: PayeeReportRow) => number) => sumIntegers(rows.map(read));
  return (
    <section aria-label='Розрахунки за період' className='flex min-w-0 flex-col gap-4'>
      <div className='flex flex-col gap-1'>
        <h2 className='text-lg font-semibold'>
          {worker ? 'Ваші розрахунки' : 'Розрахунки з працівниками та підрядниками'}
        </h2>
        <p className='text-sm text-muted-foreground'>
          {worker ? 'Показано тільки ваші розрахунки. ' : ''}Борги й аванси станом на{' '}
          {displayDate(report.filters.to)}. Нарахування та виплати — за вибраний період.
        </p>
      </div>

      <section
        aria-label='Підсумок розрахунків'
        className='grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4'
      >
        {[
          ['Нараховано за період', total(accruedInPeriod), 'З урахуванням коригувань'],
          ['Виплати за період', total(paidInPeriod), 'Мінус повернення й скасування записів'],
          ['До виплати', total((row) => row.payableCents), 'Борг за авто на кінець періоду'],
          [
            'Аванси / переплати',
            total((row) => row.advanceCents),
            'Окремо від боргів за іншими авто'
          ]
        ].map(([label, amount, description]) => (
          <Card key={label} size='sm' className='justify-between'>
            <CardHeader>
              <CardTitle>{label}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className='break-words text-lg font-semibold tabular-nums'>
                {money(amount as number)}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>
      {!worker && (
        <FieldGroup className='grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]'>
          <Field>
            <FieldLabel htmlFor={searchId}>Пошук одержувача</FieldLabel>
            <Input
              id={searchId}
              name='settlementSearch'
              type='search'
              autoComplete='off'
              placeholder='Наприклад, Сергій…'
              value={filters.settlementSearch}
              onChange={(event) => void setFilters({ settlementSearch: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={kindId}>Кого показувати</FieldLabel>
            <Select
              items={kindOptions}
              value={filters.settlementKind}
              onValueChange={(value) => {
                if (value !== null)
                  void setFilters({ settlementKind: value as typeof filters.settlementKind });
              }}
            >
              <SelectTrigger id={kindId} className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {kindOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
      )}
      <div className='flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground'>
        <p aria-live='polite'>
          Одержувачів: {rows.length}. Натисніть на ім’я для деталей за авто та історії.
        </p>
        {!worker && (filters.settlementSearch || filters.settlementKind !== 'all') && (
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={() => void setFilters({ settlementSearch: null, settlementKind: null })}
          >
            Скинути пошук і фільтр
          </Button>
        )}
      </div>
      <section aria-label='Підсумок по одержувачах' className='min-w-0'>
        {rows.length ? (
          <>
            <div className='hidden md:block'>
              <ReportGrid
                key={JSON.stringify(filters)}
                label='Підсумок по одержувачах'
                rows={rows}
                rowKey={(row) => payeeKey(row.payee)}
                columns={payeeColumns(scoped)}
              />
            </div>
            <MobilePayees key={JSON.stringify(filters)} report={scoped} />
          </>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Одержувачів не знайдено</EmptyTitle>
              <EmptyDescription>
                {report.settlements.payees.length
                  ? 'Змініть ім’я або виберіть інший тип одержувача.'
                  : 'За вибраний період немає операцій або залишків.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>
      <details className='rounded-lg border p-3 text-sm'>
        <summary className='cursor-pointer font-medium'>Як читати ці суми</summary>
        <div className='mt-3 flex flex-col gap-2 text-muted-foreground'>
          <p>
            «Нараховано» включає коригування. «Виплати» враховують повернення коштів і скасування
            помилкових записів, тому сума може бути від’ємною.
          </p>
          <p>
            «До виплати» та «Аванси / переплати» підсумовані по кожному авто окремо. Борг за одним
            замовленням не погашається авансом за іншим автоматично.
          </p>
          <p>
            Баланс на початок — до першого дня періоду; на кінець — включно з останнім днем. Дати
            операцій враховані за київським часом. CSV містить усі знайдені рядки та повну
            деталізацію.
          </p>
        </div>
      </details>
    </section>
  );
}
