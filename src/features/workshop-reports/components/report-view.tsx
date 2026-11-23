'use client';

import { Suspense } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { parseAsString, parseAsStringLiteral, useQueryStates, useQueryState } from 'nuqs';
import { useAppForm } from '@/lib/form';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { reportQueries } from '../api/queries';
import type { ReportFilters } from '../api/types';
import { defaultReportFilters, reportFiltersSchema, orderDateOptions } from '../schemas/filters';
import { reportCsv, type ReportTab } from '../lib/csv';
import { useSettlementFilters } from '../lib/use-settlement-filters';
import { filterSettlementReport } from '../lib/settlements';
import {
  PostingsSection,
  OrdersSection,
  MaterialsSection,
  SettlementsSection
} from './report-sections';

function FiltersForm({
  filters,
  workerView,
  showOrderDate,
  onApply
}: {
  filters: ReportFilters;
  workerView: boolean;
  showOrderDate: boolean;
  onApply: (value: ReportFilters) => void;
}) {
  const form = useAppForm({
    defaultValues: filters,
    validators: { onSubmit: reportFiltersSchema },
    onSubmit: ({ value }) => onApply(value)
  });
  return (
    <form
      aria-label='Період зведення'
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FieldGroup
        className={cn(
          'grid items-end gap-3 sm:grid-cols-2',
          !workerView && showOrderDate ? 'xl:grid-cols-4' : 'xl:grid-cols-3'
        )}
      >
        <form.AppField name='from'>
          {(field) => <field.TextField type='date' label='Початок періоду' required />}
        </form.AppField>
        <form.AppField name='to'>
          {(field) => <field.TextField type='date' label='Кінець періоду' required />}
        </form.AppField>
        {!workerView && showOrderDate && (
          <form.AppField name='orderDate'>
            {(field) => (
              <field.SelectField label='Відбір на вкладці «Авто»' options={orderDateOptions} />
            )}
          </form.AppField>
        )}
        <Button type='submit'>Показати зведення</Button>
      </FieldGroup>
    </form>
  );
}
function ReportContent({
  userId,
  orgId,
  filters
}: {
  userId: string;
  orgId: string;
  filters: ReportFilters;
}) {
  const { data: report } = useSuspenseQuery(reportQueries.period(userId, orgId, filters));
  const [settlementFilters] = useSettlementFilters();
  const [tab, setTab] = useQueryState(
    'reportTab',
    parseAsStringLiteral(['postings', 'orders', 'materials', 'settlements'] as const)
      .withDefault('postings')
      .withOptions({ shallow: true })
  );
  const worker = report.access.role === 'worker';
  function download(): void {
    const selected: ReportTab = worker ? 'settlements' : tab;
    const url = URL.createObjectURL(
      new Blob(
        [
          reportCsv(
            selected === 'settlements'
              ? filterSettlementReport(report, {
                  search: settlementFilters.settlementSearch,
                  kind: settlementFilters.settlementKind
                })
              : report,
            selected
          )
        ],
        { type: 'text/csv;charset=utf-8;' }
      )
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `zvedennia-${selected}-${filters.from}-${filters.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className='flex min-w-0 flex-col gap-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='text-muted-foreground text-sm'>
          Період включно: {filters.from} — {filters.to} · часовий пояс Києва
        </p>
        <Button type='button' variant='outline' onClick={download}>
          Завантажити CSV
        </Button>
      </div>
      {report.undatedRecords > 0 && (
        <Alert>
          <AlertDescription>
            Записів без коректної дати: {report.undatedRecords}. Їх не віднесено до періоду.
          </AlertDescription>
        </Alert>
      )}
      {worker ? (
        <SettlementsSection report={report} />
      ) : (
        <Tabs
          value={tab}
          onValueChange={(value) => void setTab(value as ReportTab)}
          className='min-w-0'
        >
          <div className='max-w-full overflow-x-auto'>
            <TabsList aria-label='Розділи зведення'>
              <TabsTrigger value='postings'>Проведення</TabsTrigger>
              <TabsTrigger value='orders'>Авто</TabsTrigger>
              <TabsTrigger value='materials'>Матеріали</TabsTrigger>
              <TabsTrigger value='settlements'>Розрахунки</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value='postings' className='min-w-0'>
            <PostingsSection report={report} />
          </TabsContent>
          <TabsContent value='orders' className='min-w-0'>
            <OrdersSection report={report} />
          </TabsContent>
          <TabsContent value='materials' className='min-w-0'>
            <MaterialsSection report={report} />
          </TabsContent>
          <TabsContent value='settlements' className='min-w-0'>
            <SettlementsSection report={report} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

export function ReportView({
  userId,
  orgId,
  initialToday,
  workerView = false
}: {
  userId: string;
  orgId: string;
  initialToday: string;
  workerView?: boolean;
}) {
  const defaults = defaultReportFilters(initialToday);
  const [tab] = useQueryState(
    'reportTab',
    parseAsString.withDefault('postings').withOptions({ shallow: true })
  );
  const [params, setParams] = useQueryStates(
    {
      reportFrom: parseAsString.withDefault(defaults.from),
      reportTo: parseAsString.withDefault(defaults.to),
      reportBasis: parseAsString.withDefault(defaults.orderDate)
    },
    { shallow: true }
  );
  const parsed = reportFiltersSchema.safeParse({
    from: params.reportFrom,
    to: params.reportTo,
    orderDate: workerView ? 'ready' : params.reportBasis
  });
  const filters = {
    from: params.reportFrom,
    to: params.reportTo,
    orderDate: (workerView ? 'ready' : params.reportBasis) as ReportFilters['orderDate']
  };
  const key = JSON.stringify(filters);
  return (
    <div className='flex min-w-0 flex-col gap-5'>
      <FiltersForm
        key={key}
        filters={filters}
        workerView={workerView}
        showOrderDate={tab === 'orders'}
        onApply={(value) =>
          void setParams({
            reportFrom: value.from,
            reportTo: value.to,
            reportBasis: value.orderDate
          })
        }
      />
      {parsed.success ? (
        <Suspense fallback={<Skeleton className='h-60 w-full' />}>
          <ReportContent key={key} userId={userId} orgId={orgId} filters={parsed.data} />
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
