'use client';

import { Suspense, useId } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { parseAsString, useQueryState, useQueryStates } from 'nuqs';
import { useAppForm } from '@/lib/form';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PersonAvatar } from '@/components/person-avatar';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/animated-dialog';
import { money } from '@/features/crm/lib/format';
import { historyTimestamp } from '@/features/crm/lib/workflow-history';
import { specialtyLabels, workerSpecialtyOptions } from '@/features/crm/lib/team-specialties';
import { ReportGrid, type ReportColumn } from '@/features/workshop-reports/components/report-grid';
import { payrollQueries } from '../api/queries';
import type {
  PayrollCalculation,
  PayrollEntry,
  PayrollFilters,
  PayrollTotals,
  PayrollWorker
} from '../api/types';
import {
  defaultPayrollFilters,
  payrollFiltersSchema,
  previousPayrollMonth
} from '../schemas/filters';
import { payrollTotals } from '../lib/report';
import { payrollCsv } from '../lib/csv';

function downloadCsv(workers: PayrollWorker[], filters: PayrollFilters, detailed = false): void {
  const url = URL.createObjectURL(
    new Blob([payrollCsv(workers, filters, detailed)], { type: 'text/csv;charset=utf-8;' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `zarplaty-${detailed ? 'detali-' : ''}${filters.from}-${filters.to}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function PayrollSummary({ totals }: { totals: PayrollTotals }) {
  return (
    <section
      aria-label='Підсумок зарплат'
      className='grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4'
    >
      {[
        {
          label: 'Нараховано',
          value: money(totals.accrualCents),
          description: 'При готовності авто'
        },
        {
          label: 'Перерахунки',
          value: money(totals.adjustmentCents),
          description: 'Зміни нарахувань за період'
        },
        {
          label: 'Зароблено разом',
          value: money(totals.totalCents),
          description: 'Нарахування з коригуваннями'
        },
        {
          label: 'Автомобілів',
          value: String(totals.orderCount),
          description: 'Із нарахуваннями за період'
        }
      ].map((item) => (
        <Card key={item.label} size='sm'>
          <CardHeader>
            <CardTitle>{item.label}</CardTitle>
            <CardDescription>{item.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className='break-words text-xl font-semibold tabular-nums'>{item.value}</p>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}

function calculationText(value: PayrollCalculation | null): string {
  if (value && value.baseCents < 0)
    return `Збиток ${money(-value.baseCents)} → зарплата ${money(value.amountCents)}`;
  return value
    ? `${money(value.baseCents)} × ${value.shareBps / 100}% = ${money(value.amountCents)}`
    : 'Не призначено';
}

const detailColumns: ReportColumn<PayrollEntry>[] = [
  { id: 'date', title: 'Дата', cell: (entry) => historyTimestamp(entry.createdAt) },
  {
    id: 'order',
    title: 'Авто',
    cell: (entry) => (
      <div className='flex max-w-56 flex-col gap-1 whitespace-normal'>
        <strong>№{entry.order.number}</strong>
        <span>{entry.order.vehicle}</span>
      </div>
    )
  },
  {
    id: 'role',
    title: 'Робота',
    cell: (entry) =>
      entry.role === 'subcontract'
        ? 'Субпідряд'
        : entry.role === 'responsible'
          ? 'Відповідальний'
          : workerSpecialtyOptions.find((option) => option.value === entry.role)!.label
  },
  {
    id: 'calculation',
    title: 'Розрахунок',
    cell: (entry) => (
      <div className='flex max-w-80 flex-col gap-1 whitespace-normal'>
        <Badge variant='outline'>{entry.kind === 'initial' ? 'Нарахування' : 'Перерахунки'}</Badge>
        {entry.kind === 'correction' && <span>Було: {calculationText(entry.before)}</span>}
        <span>
          {entry.kind === 'correction' ? 'Стало: ' : ''}
          {calculationText(entry.after)}
        </span>
        {entry.note && <span className='text-muted-foreground'>{entry.note}</span>}
      </div>
    )
  },
  {
    id: 'amount',
    title: 'Нараховано (±)',
    cell: (entry) => <strong className='tabular-nums'>{money(entry.amountCents)}</strong>
  }
];

function WorkerDetails({ worker, filters }: { worker: PayrollWorker; filters: PayrollFilters }) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type='button'
            aria-label={`Зарплата: ${worker.name}`}
            className='rounded-sm text-left font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring'
          />
        }
        aria-label={`Зарплата: ${worker.name}`}
      >
        {worker.name}
      </DialogTrigger>
      <DialogContent className='flex max-h-[90dvh] min-w-0 flex-col sm:max-w-5xl'>
        <DialogHeader>
          <DialogTitle>Зарплата — {worker.name}</DialogTitle>
          <DialogDescription>
            {filters.from} — {filters.to} включно. Нарахування за датою проведення, часовий пояс
            Києва.
          </DialogDescription>
        </DialogHeader>
        <div className='flex min-h-0 min-w-0 flex-col gap-4 overflow-y-auto'>
          <dl
            aria-label='Заробіток працівника за період'
            className='grid grid-cols-2 gap-3 rounded-lg border p-3'
          >
            {[
              ['Нараховано', money(worker.accrualCents)],
              ['Перерахунки', money(worker.adjustmentCents)],
              ['Зароблено разом', money(worker.totalCents)],
              ['Автомобілів', String(worker.orderCount)]
            ].map(([label, value]) => (
              <div key={label} className='flex min-w-0 flex-col gap-1'>
                <dt className='text-sm text-muted-foreground'>{label}</dt>
                <dd className='break-words font-semibold tabular-nums'>{value}</dd>
              </div>
            ))}
          </dl>
          <ReportGrid
            label={`Нарахування: ${worker.name}`}
            rows={worker.entries}
            columns={detailColumns}
            rowKey={(entry) => entry.id}
          />
        </div>
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            onClick={() => downloadCsv([worker], filters, true)}
          >
            Деталізація CSV
          </Button>
          <DialogClose render={<Button type='button' />}>Закрити</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function payrollWorkerColumns(filters: PayrollFilters): ReportColumn<PayrollWorker>[] {
  return [
    {
      id: 'worker',
      title: 'Працівник',
      cell: (worker) => (
        <div className='flex max-w-64 items-center gap-3 whitespace-normal'>
          <PersonAvatar
            identity={`user:${worker.id}`}
            name={worker.name}
            imageUrl={worker.imageUrl}
          />
          <div className='flex min-w-0 flex-col gap-1'>
            <WorkerDetails worker={worker} filters={filters} />
            <span className='text-xs text-muted-foreground'>
              {worker.active
                ? specialtyLabels(worker.specialties) || 'Спеціалізації не вказано'
                : 'Колишній учасник'}
            </span>
          </div>
        </div>
      )
    },
    { id: 'orders', title: 'Авто', cell: (worker) => worker.orderCount },
    { id: 'accrual', title: 'Нараховано', cell: (worker) => money(worker.accrualCents) },
    { id: 'adjustment', title: 'Перерахунки', cell: (worker) => money(worker.adjustmentCents) },
    {
      id: 'total',
      title: 'Зароблено разом',
      cell: (worker) => <strong className='tabular-nums'>{money(worker.totalCents)}</strong>
    }
  ];
}

function PayrollContent({
  userId,
  orgId,
  filters
}: {
  userId: string;
  orgId: string;
  filters: PayrollFilters;
}) {
  const { data: report } = useSuspenseQuery(payrollQueries.period(userId, orgId, filters));
  const [search, setSearch] = useQueryState(
    'payrollSearch',
    parseAsString.withDefault('').withOptions({ shallow: true })
  );
  const searchId = useId();
  const workerView = report.access.role === 'worker';
  const workers = workerView
    ? report.workers
    : report.workers.filter((worker) =>
        `${worker.name} ${specialtyLabels(worker.specialties)}`
          .toLocaleLowerCase('uk')
          .includes(search.trim().toLocaleLowerCase('uk'))
      );
  const totals = payrollTotals(workers.flatMap((worker) => worker.entries));
  const columns = payrollWorkerColumns(filters);
  return (
    <div className='flex min-w-0 flex-col gap-4'>
      <p className='text-sm text-muted-foreground'>
        Період включно: {filters.from} — {filters.to} · часовий пояс Києва. Перерахунки враховуються
        датою їх проведення.
      </p>
      {workerView && (
        <p className='text-sm text-muted-foreground'>Показано тільки ваші нарахування.</p>
      )}
      <PayrollSummary totals={totals} />
      {report.warnings.undatedPostings > 0 && (
        <Alert>
          <AlertDescription>
            Нарахувань без коректної дати: {report.warnings.undatedPostings}. Вони не включені до
            підсумку.
          </AlertDescription>
        </Alert>
      )}
      {report.warnings.unpostedOrders.length > 0 && (
        <Alert>
          <AlertDescription>
            Готових авто без проведеного розрахунку: {report.warnings.unpostedOrders.length}. Вони
            ще не включені до зарплат. Для застосування нової формули відкрийте й явно збережіть
            роботи або витрати замовлення:{' '}
            {report.warnings.unpostedOrders
              .slice(0, 10)
              .map((order) => `№${order.number}`)
              .join(', ')}
            {report.warnings.unpostedOrders.length > 10 ? '…' : ''}.
          </AlertDescription>
        </Alert>
      )}
      {report.warnings.coloristSubcontractCents !== 0 && (
        <Alert>
          <AlertDescription>
            Підбір фарби: {money(report.warnings.coloristSubcontractCents)} за період обліковується
            як субпідряд. Ця сума не включена до зарплат команди, доки одержувачів не вибрано з
            команди або для них не ввімкнено показ субпідряду в зарплатах.
          </AlertDescription>
        </Alert>
      )}
      <div className='flex flex-wrap items-end justify-between gap-3'>
        {!workerView && (
          <Field className='max-w-sm'>
            <FieldLabel htmlFor={searchId}>Пошук працівника</FieldLabel>
            <Input
              id={searchId}
              type='search'
              placeholder='Ім’я або спеціалізація'
              value={search}
              onChange={(event) => void setSearch(event.target.value)}
            />
          </Field>
        )}
        <Button type='button' variant='outline' onClick={() => downloadCsv(workers, filters)}>
          Завантажити CSV
        </Button>
      </div>
      <ReportGrid
        key={search}
        label='Зарплати команди'
        rows={workers}
        columns={columns}
        rowKey={(worker) => worker.id}
      />
    </div>
  );
}

function PayrollFiltersForm({
  filters,
  initialToday,
  onApply
}: {
  filters: PayrollFilters;
  initialToday: string;
  onApply: (value: PayrollFilters) => void;
}) {
  const form = useAppForm({
    defaultValues: filters,
    validators: { onSubmit: payrollFiltersSchema },
    onSubmit: ({ value }) => onApply(value)
  });
  return (
    <form
      aria-label='Період зарплат'
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup className='gap-3'>
        <FieldGroup className='grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-3'>
          <form.AppField name='from'>
            {(field) => <field.TextField type='date' label='Початок періоду' required />}
          </form.AppField>
          <form.AppField name='to'>
            {(field) => <field.TextField type='date' label='Кінець періоду' required />}
          </form.AppField>
          <Button type='submit'>Показати зарплати</Button>
        </FieldGroup>
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => onApply(defaultPayrollFilters(initialToday))}
          >
            Поточний місяць
          </Button>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={() => onApply(previousPayrollMonth(initialToday))}
          >
            Минулий місяць
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

interface PayrollViewProps {
  userId: string;
  orgId: string;
  initialToday: string;
}

export function PayrollView({ userId, orgId, initialToday }: PayrollViewProps) {
  const defaults = defaultPayrollFilters(initialToday);
  const [params, setParams] = useQueryStates(
    {
      payrollFrom: parseAsString.withDefault(defaults.from),
      payrollTo: parseAsString.withDefault(defaults.to)
    },
    { shallow: true }
  );
  const filters = { from: params.payrollFrom, to: params.payrollTo };
  const parsed = payrollFiltersSchema.safeParse(filters);
  const key = JSON.stringify(filters);
  return (
    <div className='flex min-w-0 flex-col gap-5'>
      <PayrollFiltersForm
        key={key}
        filters={filters}
        initialToday={initialToday}
        onApply={(value) => void setParams({ payrollFrom: value.from, payrollTo: value.to })}
      />
      {parsed.success ? (
        <Suspense fallback={<Skeleton className='h-60 w-full' />}>
          <PayrollContent key={key} userId={userId} orgId={orgId} filters={parsed.data} />
        </Suspense>
      ) : (
        <Alert variant='destructive'>
          <AlertDescription>
            {parsed.error.issues.map((issue) => issue.message).join('. ')}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
