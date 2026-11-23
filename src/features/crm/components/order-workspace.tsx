'use client';

import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { buttonVariants } from '@/components/ui/button';
import { OrderMaterials } from '@/features/inventory/components/order-materials';
import { OrderEconomicsPanel } from '@/features/order-economics/components/economics-panel';
import { OrderWorkDetails } from '@/features/order-economics/components/order-work-details';
import type { CrmWorkspace, RepairOrder, RepairRequest } from '../api/types';
import { ORDER_TABS, type OrderTab } from '../lib/order-tabs';
import { paymentBalance } from '../lib/payment-balance';
import { money, vehicleLabel } from './format';
import { OrderForm, type OrderFormSections } from './forms';
import { OrderReadView } from './order-read-view';
import { OrderPayments } from './order-payments';
import { WorkflowDates, WorkflowHistory } from './workflow-details';
import { WorkflowForm } from './workflow-form';
import { ExecutorAdvance } from './executor-advance';
import { DialogFormContext } from './dialog-form';
import { StatusBadge } from './status-badge';
import { Button } from './action-button';
import type { FormState } from './form-status';

const EMPTY_STATE: FormState = { dirty: false, pending: false };
const DRAFT_PARTS = [
  'main',
  'works',
  'workflow',
  'details',
  'materials',
  'payments',
  'economics'
] as const;
type DraftPart = (typeof DRAFT_PARTS)[number];

function OrderFormScope({ active, children }: { active: boolean; children: ReactNode }) {
  const layout = useContext(DialogFormContext);
  const formId = useId();
  const value = useMemo(
    () => (layout ? { ...layout, formId, active: active && layout.active !== false } : null),
    [layout, formId, active]
  );
  return <DialogFormContext value={value}>{children}</DialogFormContext>;
}

function OrderPanel({
  value,
  active,
  direction,
  reducedMotion,
  children
}: {
  value: OrderTab;
  active: OrderTab;
  direction: number;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  return (
    <TabsContent value={value} keepMounted className='min-w-0' data-order-tab={value}>
      <motion.div
        data-slot='order-tab-animation'
        initial={false}
        animate={{
          opacity: reducedMotion || active === value ? 1 : 0,
          x: active === value || reducedMotion ? 0 : direction * 12
        }}
        transition={{ duration: reducedMotion ? 0 : 0.18, ease: 'easeOut' }}
        className='flex min-w-0 flex-col gap-4'
      >
        {children}
      </motion.div>
    </TabsContent>
  );
}

interface OrderWorkspaceProps {
  order?: RepairOrder;
  request?: RepairRequest;
  data: CrmWorkspace;
  initialTab?: OrderTab;
  onCreated: (id: string) => void;
  onClose: () => void;
  onStateChange: (state: FormState) => void;
  onBackToHistory?: () => void;
}

export function OrderWorkspace({
  order,
  request,
  data,
  initialTab = 'main',
  onCreated,
  onClose,
  onStateChange,
  onBackToHistory
}: OrderWorkspaceProps): ReactElement {
  const [active, setActive] = useState<OrderTab>(order ? initialTab : 'main');
  const [visited, setVisited] = useState(
    () => new Set<OrderTab>(['main', 'works', ...(order ? [initialTab] : [])])
  );
  const [direction, setDirection] = useState(1);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<DraftPart, FormState>>(
    () =>
      Object.fromEntries(DRAFT_PARTS.map((part) => [part, EMPTY_STATE])) as Record<
        DraftPart,
        FormState
      >
  );
  const callbacks = useMemo(
    () =>
      Object.fromEntries(
        DRAFT_PARTS.map((part) => [
          part,
          (state: FormState) =>
            setDrafts((current) =>
              current[part].dirty === state.dirty && current[part].pending === state.pending
                ? current
                : { ...current, [part]: state }
            )
        ])
      ) as Record<DraftPart, (state: FormState) => void>,
    []
  );
  const formState = useCallback(
    (part: 'main' | 'works', state: FormState) => callbacks[part](state),
    [callbacks]
  );
  const dirty = DRAFT_PARTS.some((part) => drafts[part].dirty);
  const busy = DRAFT_PARTS.some((part) => drafts[part].pending);
  useEffect(() => {
    onStateChange({ dirty, pending: busy });
  }, [dirty, busy, onStateChange]);
  const scroll = useRef<HTMLDivElement>(null);
  const focusInvalid = useRef(false);
  const reducedMotion = !!useReducedMotion();
  const worker = data.access?.role === 'worker';
  const vehicle = data.vehicles.find((entry) => entry.id === (order ?? request)?.vehicleId);
  const balance = order ? paymentBalance(order, data.payments) : null;
  const tabDirty = (tab: OrderTab) =>
    tab !== 'history' &&
    (drafts[tab].dirty ||
      (tab === 'main' && drafts.workflow.dirty) ||
      (tab === 'works' && drafts.details.dirty));
  const blocked = (...except: DraftPart[]) =>
    DRAFT_PARTS.some(
      (part) => !except.includes(part) && (drafts[part].dirty || drafts[part].pending)
    );
  const saved = useCallback(() => undefined, []);
  const workflowSaved = useCallback(() => {
    setWorkflowOpen(false);
    callbacks.workflow(EMPTY_STATE);
  }, [callbacks]);

  function changeTab(next: OrderTab): void {
    if (busy || (!order && next !== 'main' && next !== 'works')) return;
    setDirection(
      ORDER_TABS.findIndex((tab) => tab.value === next) >=
        ORDER_TABS.findIndex((tab) => tab.value === active)
        ? 1
        : -1
    );
    setVisited((previous) => (previous.has(next) ? previous : new Set([...previous, next])));
    setActive(next);
    if (scroll.current) scroll.current.scrollTop = 0;
  }
  useEffect(() => {
    if (!focusInvalid.current) return;
    const frame = requestAnimationFrame(() => {
      scroll.current
        ?.querySelector<HTMLElement>(`[data-order-tab="${active}"] [aria-invalid="true"]`)
        ?.focus();
      focusInvalid.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);
  const invalidSection = (tab: 'main' | 'works') => {
    focusInvalid.current = true;
    setActive(tab);
    if (scroll.current) scroll.current.scrollTop = 0;
    requestAnimationFrame(() =>
      scroll.current
        ?.querySelector<HTMLElement>('[role=tabpanel]:not([hidden]) [aria-invalid=true]')
        ?.focus()
    );
  };
  const panel = (tab: OrderTab, content: ReactNode) => (
    <OrderPanel
      key={tab}
      value={tab}
      active={active}
      direction={direction}
      reducedMotion={reducedMotion}
    >
      {content}
    </OrderPanel>
  );
  const scope = (tab: OrderTab, content: ReactNode, enabled = true) => (
    <OrderFormScope active={active === tab && enabled}>{content}</OrderFormScope>
  );
  const renderPanels = (sections?: OrderFormSections) => (
    <>
      {panel(
        'main',
        <>
          {onBackToHistory && (
            <Button
              type='button'
              variant='outline'
              className='self-start'
              disabled={busy}
              onClick={onBackToHistory}
            >
              До автомобілів клієнта
            </Button>
          )}
          {order && <WorkflowDates target={{ kind: 'order', record: order }} />}
          {worker && order ? (
            <>
              <OrderReadView order={order} data={data} section='main' />
              {scope(
                'main',
                <ExecutorAdvance order={order} onSaved={saved} onStateChange={callbacks.workflow} />
              )}
            </>
          ) : (
            <>
              {order && (
                <Button
                  type='button'
                  variant='outline'
                  className='self-start'
                  disabled={busy || (workflowOpen && drafts.workflow.dirty)}
                  onClick={() => setWorkflowOpen((open) => !open)}
                >
                  {workflowOpen ? 'До даних замовлення' : 'Змінити статус і дати'}
                </Button>
              )}
              <div hidden={workflowOpen} inert={workflowOpen}>
                {scope('main', sections?.main, !workflowOpen)}
              </div>
              {order &&
                workflowOpen &&
                scope(
                  'main',
                  <WorkflowForm
                    target={{ kind: 'order', record: order }}
                    disabled={blocked('workflow')}
                    onSaved={workflowSaved}
                    onCancel={() => {
                      setWorkflowOpen(false);
                      callbacks.workflow(EMPTY_STATE);
                    }}
                    onStateChange={callbacks.workflow}
                  />
                )}
            </>
          )}
        </>
      )}
      {panel(
        'works',
        <>
          {worker && order ? (
            <OrderReadView order={order} data={data} section='works' />
          ) : (
            <div hidden={drafts.details.dirty} inert={drafts.details.dirty}>
              {scope('works', sections?.works, !drafts.details.dirty)}
            </div>
          )}
          {order &&
            data.access &&
            scope(
              'works',
              <OrderWorkDetails
                order={order}
                data={data}
                disabled={blocked('details')}
                onStateChange={callbacks.details}
                onFinancialCorrection={() => changeTab('economics')}
              />
            )}
        </>
      )}
      {order && data.access && (
        <>
          {panel(
            'materials',
            visited.has('materials') &&
              scope(
                'materials',
                <OrderMaterials
                  order={order}
                  access={data.access}
                  disabled={blocked('materials')}
                  locked={data.finance?.postings.some((entry) => entry.orderId === order.id)}
                  onStateChange={callbacks.materials}
                />
              )
          )}
          {panel(
            'payments',
            visited.has('payments') &&
              scope(
                'payments',
                <OrderPayments
                  orderId={order.id}
                  data={data}
                  disabled={blocked('payments')}
                  onStateChange={callbacks.payments}
                />
              )
          )}
          {panel(
            'economics',
            visited.has('economics') &&
              scope(
                'economics',
                <OrderEconomicsPanel
                  order={order}
                  data={data}
                  disabled={blocked('economics')}
                  onSaved={saved}
                  onStateChange={callbacks.economics}
                />
              )
          )}
          {panel(
            'history',
            visited.has('history') && (
              <WorkflowHistory target={{ kind: 'order', record: order }} data={data} />
            )
          )}
        </>
      )}
    </>
  );

  return (
    <Tabs
      value={active}
      onValueChange={(value) => {
        if (ORDER_TABS.some((tab) => tab.value === value)) changeTab(value as OrderTab);
      }}
      className='flex min-h-0 flex-1 flex-col gap-0 overflow-hidden'
      data-slot='order-workspace'
    >
      {order && (
        <section
          aria-label='Зведення замовлення'
          className='flex shrink-0 flex-col gap-2 border-b px-5 py-3 sm:px-6'
        >
          <div className='flex min-w-0 flex-wrap items-center justify-between gap-2'>
            <div
              className='min-w-0 flex-1 text-sm font-medium'
              title={vehicle ? vehicleLabel(vehicle) : ''}
            >
              <p className='truncate'>
                {vehicle ? `${vehicle.make} ${vehicle.model}` : 'Автомобіль замовлення'}
              </p>
              {vehicle?.plate && (
                <p className='text-muted-foreground font-mono text-xs'>{vehicle.plate}</p>
              )}
            </div>
            <StatusBadge status={order.status} />
            {dirty || busy ? (
              <Button variant='outline' size='sm' aria-label='Друк замовлення' disabled>
                <PrintLabel />
              </Button>
            ) : (
              <a
                href={`/print/orders/${order.id}`}
                aria-label='Друк замовлення'
                target='_blank'
                rel='noopener noreferrer'
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                <PrintLabel />
              </a>
            )}
          </div>
          <dl className='grid min-w-0 grid-cols-3 gap-2 text-xs sm:text-sm'>
            {(
              [
                ['Чек', order.totalCents],
                ['Оплачено', balance!.paidCents],
                [
                  balance!.overpaidCents ? 'Переплата' : 'До сплати',
                  balance!.overpaidCents || balance!.remainingCents
                ]
              ] as const
            ).map(([label, amount]) => (
              <div key={label} className='min-w-0'>
                <dt className='text-muted-foreground'>{label}</dt>
                <dd className='font-semibold break-words tabular-nums'>{money(amount)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      <div
        className='shrink-0 overflow-x-auto border-b px-5 py-2 [scrollbar-width:thin] sm:px-6'
        data-slot='order-tabs-navigation'
      >
        <TabsList
          variant='line'
          aria-label='Розділи замовлення'
          className='h-auto min-h-9 w-max min-w-full justify-start gap-1'
        >
          {ORDER_TABS.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              aria-label={tab.label}
              aria-description={tabDirty(tab.value) ? 'Є незбережені зміни' : undefined}
              data-dirty={tabDirty(tab.value) || undefined}
              disabled={busy || (!order && tab.value !== 'main' && tab.value !== 'works')}
              title={
                !order && tab.value !== 'main' && tab.value !== 'works'
                  ? 'Спочатку створіть замовлення'
                  : tab.description
              }
              className='min-h-9 shrink-0 px-3'
              onFocus={(event) =>
                event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
              }
            >
              {tab.label}
              {tabDirty(tab.value) && (
                <span className='size-1.5 rounded-full bg-current' aria-label='Незбережені зміни' />
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div
        ref={scroll}
        data-slot='crm-dialog-body'
        className='relative flex min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto overscroll-contain px-5 py-4 [scrollbar-gutter:stable] sm:px-6'
      >
        <p className='text-muted-foreground text-sm'>
          {ORDER_TABS.find((tab) => tab.value === active)?.description}
        </p>
        {dirty && (
          <Alert>
            <AlertDescription>
              Незбережені зміни:{' '}
              {ORDER_TABS.filter((tab) => tab.value !== 'history' && tabDirty(tab.value))
                .map((tab) => tab.label)
                .join(', ')}
              . Суми в шапці та економіка показані за збереженими даними.
            </AlertDescription>
          </Alert>
        )}
        {worker ? (
          renderPanels()
        ) : (
          <OrderForm
            data={data}
            request={request}
            order={order}
            disabled={blocked('main', 'works')}
            onSaved={saved}
            onCancel={onClose}
            onCreated={onCreated}
            onSectionStateChange={formState}
            onInvalidSection={invalidSection}
            renderSections={renderPanels}
          />
        )}
      </div>
    </Tabs>
  );
}

function PrintLabel(): ReactElement {
  return (
    <>
      <span className='sm:hidden'>Друк</span>
      <span className='hidden sm:inline'>Друк замовлення</span>
    </>
  );
}
