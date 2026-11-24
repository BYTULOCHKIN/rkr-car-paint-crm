'use client';

import { OrderTrashAction } from './order-trash-action';
import { ExecutorAdvance } from './executor-advance';
import { useEffect, useId, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter
} from '@/components/ui/alert-dialog';
import { CustomerHistory } from './customer-history';
import { cn } from '@/lib/utils';
import { Icons } from '@/components/icons';
import type {
  CrmWorkspace,
  Customer,
  Vehicle,
  RepairRequest,
  RepairOrder,
  WorkflowRecord,
  BoardStatus
} from '../api/types';
import { CustomerForm, VehicleForm, VinForm, RequestForm } from './forms';
import { Button } from './action-button';
import type { FormState } from './form-status';
import { WorkflowForm } from './workflow-form';
import { WorkflowDates, WorkflowHistory } from './workflow-details';
import { VehicleOwnerForm } from './vehicle-owner-form';
import { VehicleDetails, DeleteVehicle } from './vehicle-details';
import { DialogFormContext } from './dialog-form';
import { OrderWorkspace } from './order-workspace';
import type { OrderTab } from '../lib/order-tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { crmQueries } from '../api/queries';

export type Editor =
  | { type: 'trashOrder'; order: RepairOrder }
  | { type: 'restoreOrder'; order: RepairOrder }
  | { type: 'vehicleDetails'; vehicle: Vehicle }
  | { type: 'deleteVehicle'; vehicle: Vehicle }
  | { type: 'owner'; vehicle: Vehicle }
  | { type: 'customer'; customer?: Customer }
  | { type: 'vehicle'; customer?: Customer; vehicle?: Vehicle }
  | { type: 'vin'; vehicle: Vehicle }
  | { type: 'request' }
  | {
      type: 'order';
      request?: RepairRequest;
      order?: RepairOrder;
      historyCustomer?: Customer;
      tab?: OrderTab;
    }
  | { type: 'history'; customer: Customer; initialVehicleId?: string }
  | { type: 'workflow'; target: WorkflowRecord; requestedStatus?: BoardStatus };

interface CrmEditorDialogProps {
  editor: Editor;
  data: CrmWorkspace;
  onClose: () => void;
  onSelectOrder: (order: RepairOrder) => void;
  onBackToHistory?: (customer: Customer, vehicleId: string) => void;
}

export function CrmEditorDialog(props: CrmEditorDialogProps) {
  const [createdId, setCreatedId] = useState<string | null>(null);
  const { editor, data } = props;
  const detail =
    editor.type === 'workflow'
      ? { id: editor.target.record.id, kind: 'history' as const, entity: editor.target.kind }
      : editor.type === 'order'
        ? { id: createdId ?? editor.order?.id, kind: 'order' as const, entity: 'order' as const }
        : editor.type === 'history'
          ? { id: editor.customer.id, kind: 'history' as const, entity: 'customer' as const }
          : ['vehicleDetails', 'deleteVehicle', 'owner', 'vehicle'].includes(editor.type) &&
              'vehicle' in editor &&
              editor.vehicle
            ? { id: editor.vehicle.id, kind: 'history' as const, entity: 'vehicle' as const }
            : undefined;
  const result = useQuery({
    ...crmQueries.detail(
      data.access?.userId ?? '',
      data.access?.orgId ?? '',
      detail?.id ?? '',
      detail?.kind,
      detail?.entity
    ),
    enabled: !!data.serverRead && !!detail?.id
  });
  if (data.serverRead && detail?.id && !result.data)
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) props.onClose();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Завантаження даних</DialogTitle>
            <DialogDescription>Отримуємо актуальні дані запису.</DialogDescription>
          </DialogHeader>
          {result.isError ? (
            <div role='alert'>
              Не вдалося завантажити запис.{' '}
              <Button onClick={() => void result.refetch()}>Повторити</Button>
            </div>
          ) : (
            <Skeleton className='h-64 w-full' />
          )}
        </DialogContent>
      </Dialog>
    );
  // A workflow draft keeps the target/revision captured when it was opened.
  const resolvedEditor =
    createdId && editor.type === 'order' && result.data?.orders[0]
      ? { ...editor, order: result.data.orders[0] }
      : editor;
  return (
    <CrmEditorDialogContent
      {...props}
      editor={resolvedEditor}
      data={
        result.data
          ? { ...data, ...result.data, access: data.access, team: data.team, serverRead: true }
          : data
      }
      onOrderCreated={setCreatedId}
    />
  );
}

function CrmEditorDialogContent({
  editor,
  data,
  onClose,
  onSelectOrder,
  onBackToHistory,
  onOrderCreated
}: CrmEditorDialogProps & { onOrderCreated: (id: string) => void }) {
  const [state, setState] = useState<FormState>({ dirty: false, pending: false });
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const order =
    editor.type === 'order'
      ? (data.orders.find((entry) => entry.id === (createdOrderId ?? editor.order?.id)) ??
        editor.order)
      : undefined;
  const dirty = state.dirty;
  const busy = state.pending;
  const [discard, setDiscard] = useState(false);
  const [discardDestination, setDiscardDestination] = useState<'close' | 'history'>('close');
  const backToHistory =
    editor.type === 'order' && editor.order && editor.historyCustomer && onBackToHistory
      ? () => onBackToHistory(editor.historyCustomer!, editor.order!.vehicleId)
      : undefined;
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);
  const formId = useId();
  const formLayout = useMemo(() => ({ formId, footer }), [formId, footer]);
  const worker = data.access?.role === 'worker';
  const denied =
    worker &&
    !(
      editor.type === 'history' ||
      editor.type === 'vehicleDetails' ||
      (editor.type === 'order' && editor.order) ||
      (editor.type === 'workflow' && editor.target.kind === 'order')
    );
  const readOnly = worker || editor.type === 'history' || editor.type === 'vehicleDetails';
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  function requestClose(): void {
    if (busy) return;
    if (dirty) {
      setDiscardDestination('close');
      setDiscard(true);
    } else onClose();
  }

  function requestHistory(): void {
    if (busy) return;
    if (dirty) {
      setDiscardDestination('history');
      setDiscard(true);
    } else backToHistory?.();
  }

  const title =
    editor.type === 'trashOrder'
      ? `Перемістити замовлення №${editor.order.number} в кошик`
      : editor.type === 'restoreOrder'
        ? `Відновлення замовлення №${editor.order.number}`
        : editor.type === 'vehicleDetails'
          ? 'Картка автомобіля'
          : editor.type === 'deleteVehicle'
            ? 'Видалення автомобіля'
            : editor.type === 'owner'
              ? 'Закріпити автомобіль за клієнтом'
              : editor.type === 'workflow'
                ? 'Статус, дати та перенесення'
                : editor.type === 'customer'
                  ? editor.customer
                    ? 'Редагування клієнта'
                    : 'Новий клієнт'
                  : editor.type === 'vehicle'
                    ? editor.vehicle
                      ? 'Редагування автомобіля'
                      : 'Новий автомобіль'
                    : editor.type === 'vin'
                      ? 'VIN автомобіля'
                      : editor.type === 'request'
                        ? 'Нова заявка'
                        : editor.type === 'history'
                          ? `Історія: ${editor.customer.name}`
                          : order
                            ? `Замовлення №${order.number}`
                            : editor.request
                              ? 'Створити замовлення із заявки'
                              : 'Нове замовлення';
  const description =
    editor.type === 'trashOrder'
      ? 'Підтвердіть переміщення замовлення в кошик.'
      : editor.type === 'restoreOrder'
        ? 'Поверніть замовлення до робочого списку.'
        : editor.type === 'vehicleDetails'
          ? 'Основні дані та історія звернень цього автомобіля.'
          : editor.type === 'deleteVehicle'
            ? 'Підтвердіть видалення автомобіля.'
            : editor.type === 'owner'
              ? 'Виберіть клієнта для цього автомобіля.'
              : editor.type === 'workflow'
                ? 'Оновіть план і зафіксуйте фактичні дати, не втрачаючи історії.'
                : editor.type === 'customer'
                  ? editor.customer
                    ? 'Оновіть ім’я, контакти та нотатки клієнта.'
                    : 'Додайте контактні дані клієнта.'
                  : editor.type === 'vehicle'
                    ? 'Виберіть марку, модель та рік автомобіля.'
                    : editor.type === 'vin'
                      ? 'Вкажіть VIN, щоб автомобіль можна було взяти в роботу.'
                      : editor.type === 'request'
                        ? 'Виберіть клієнта, його автомобіль та опишіть потрібні роботи.'
                        : editor.type === 'history'
                          ? 'Автомобілі клієнта, деталі ремонтів і повна історія замовлень.'
                          : order
                            ? 'Керуйте роботами та розрахунками у вкладках.'
                            : 'Вкажіть основні дані й роботи, щоб створити замовлення.';
  const props = {
    onSaved: backToHistory ?? onClose,
    onCancel: requestClose,
    onStateChange: setState
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className={cn(
            'flex max-h-[90dvh] min-w-0 flex-col gap-0 overflow-hidden p-0',
            editor.type === 'history'
              ? 'sm:max-w-5xl'
              : editor.type === 'order'
                ? 'h-[90dvh] sm:max-w-3xl'
                : 'sm:max-w-lg'
          )}
        >
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            className='absolute top-2 right-2'
            aria-label='Закрити'
            disabled={busy}
            onClick={requestClose}
          >
            <Icons.close />
          </Button>
          <DialogHeader className='shrink-0 border-b px-5 py-4 pr-12 sm:px-6 sm:pr-12'>
            <DialogTitle className='line-clamp-2 break-words leading-snug' title={title}>
              {title}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <DialogFormContext value={formLayout}>
            {/* Relative positioning contains Base UI's hidden inputs within this scroll area. */}
            <div
              data-slot={editor.type === 'order' ? 'crm-order-container' : 'crm-dialog-body'}
              className={cn(
                'relative flex min-h-0 flex-col',
                editor.type === 'order'
                  ? 'flex-1 overflow-hidden'
                  : 'gap-5 overflow-y-auto overscroll-contain px-5 py-5 [scrollbar-gutter:stable] sm:px-6'
              )}
            >
              {denied ? (
                <p role='alert'>Ця дія доступна лише адміністратору.</p>
              ) : (
                <>
                  {(editor.type === 'trashOrder' || editor.type === 'restoreOrder') &&
                    data.access && (
                      <OrderTrashAction
                        order={editor.order}
                        access={data.access}
                        restore={editor.type === 'restoreOrder'}
                        {...props}
                      />
                    )}
                  {editor.type === 'customer' && (
                    <CustomerForm
                      customer={editor.customer}
                      orgId={data.access?.orgId}
                      {...props}
                    />
                  )}
                  {editor.type === 'vehicleDetails' && (
                    <VehicleDetails
                      vehicle={editor.vehicle}
                      data={data}
                      onSelectOrder={onSelectOrder}
                    />
                  )}
                  {editor.type === 'deleteVehicle' && (
                    <DeleteVehicle vehicle={editor.vehicle} {...props} />
                  )}
                  {editor.type === 'owner' && (
                    <VehicleOwnerForm vehicle={editor.vehicle} data={data} {...props} />
                  )}
                  {editor.type === 'vehicle' && (
                    <VehicleForm
                      customer={editor.customer}
                      vehicle={editor.vehicle}
                      data={data}
                      {...props}
                    />
                  )}
                  {editor.type === 'vin' && <VinForm vehicle={editor.vehicle} {...props} />}
                  {editor.type === 'request' && <RequestForm data={data} {...props} />}
                  {editor.type === 'workflow' && (
                    <>
                      <section className='flex flex-col gap-1 rounded-lg border p-3'>
                        <h3 className='text-sm font-medium'>Потрібні роботи</h3>
                        <p className='text-muted-foreground text-sm break-words whitespace-pre-wrap'>
                          {editor.target.record.description}
                        </p>
                      </section>
                      <WorkflowDates target={editor.target} />
                      {worker && editor.target.kind === 'order' ? (
                        <ExecutorAdvance order={editor.target.record} {...props} />
                      ) : (
                        <WorkflowForm
                          target={editor.target}
                          requestedStatus={editor.requestedStatus}
                          {...props}
                        />
                      )}
                      <WorkflowHistory target={editor.target} data={data} />
                    </>
                  )}
                  {editor.type === 'order' &&
                    (createdOrderId && !order ? (
                      <Skeleton className='m-5 h-32' />
                    ) : (
                      <OrderWorkspace
                        key={order?.id ?? 'new-order'}
                        order={order}
                        request={editor.request}
                        data={data}
                        initialTab={editor.tab}
                        onCreated={(id) => {
                          setCreatedOrderId(id);
                          onOrderCreated(id);
                        }}
                        onClose={requestClose}
                        onStateChange={setState}
                        onBackToHistory={backToHistory ? requestHistory : undefined}
                      />
                    ))}
                  {editor.type === 'history' && (
                    <CustomerHistory
                      customer={editor.customer}
                      data={data}
                      initialVehicleId={editor.initialVehicleId}
                      onSelectOrder={onSelectOrder}
                    />
                  )}
                </>
              )}
            </div>
            <div
              ref={setFooter}
              data-slot='crm-dialog-footer'
              className='bg-muted/40 shrink-0 border-t px-5 py-4 sm:px-6 [&:has([data-slot=crm-form-actions])_[data-slot=crm-dialog-fallback-actions]]:hidden'
              role='group'
              aria-label='Дії вікна'
            >
              {(readOnly || editor.type === 'order') && (
                <div data-slot='crm-dialog-fallback-actions' className='flex justify-end'>
                  <Button variant='outline' disabled={busy} onClick={requestClose}>
                    Закрити вікно
                  </Button>
                </div>
              )}
            </div>
          </DialogFormContext>
        </DialogContent>
      </Dialog>
      <AlertDialog open={discard} onOpenChange={setDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Скасувати зміни?</AlertDialogTitle>
            <AlertDialogDescription>
              Введені дані ще не збережено. Якщо закрити форму, їх буде втрачено.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant='outline' onClick={() => setDiscard(false)}>
              Продовжити редагування
            </Button>
            <Button
              variant='destructive'
              onClick={() => (discardDestination === 'history' ? backToHistory?.() : onClose())}
            >
              Скасувати зміни
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
