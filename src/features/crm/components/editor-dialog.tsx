'use client';

import { ExecutorAdvance } from './executor-advance';
import { OrderPayments } from './order-payments';
import { OrderMaterials } from '@/features/inventory/components/order-materials';
import { OrderEconomicsPanel } from '@/features/order-economics/components/economics-panel';
import { OrderReadView } from './order-read-view';
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
import { CustomerForm, VehicleForm, VinForm, RequestForm, OrderForm } from './forms';
import { Button } from './action-button';
import type { FormState } from './form-status';
import { WorkflowForm } from './workflow-form';
import { WorkflowDates, WorkflowHistory } from './workflow-details';
import { VehicleOwnerForm } from './vehicle-owner-form';
import { VehicleDetails, DeleteVehicle } from './vehicle-details';
import { buttonVariants } from '@/components/ui/button';
import { DialogFormContext } from './dialog-form';

export type Editor =
  | { type: 'vehicleDetails'; vehicle: Vehicle }
  | { type: 'deleteVehicle'; vehicle: Vehicle }
  | { type: 'owner'; vehicle: Vehicle }
  | { type: 'customer'; customer?: Customer }
  | { type: 'vehicle'; customer?: Customer; vehicle?: Vehicle }
  | { type: 'vin'; vehicle: Vehicle }
  | { type: 'request' }
  | { type: 'order'; request?: RepairRequest; order?: RepairOrder; historyCustomer?: Customer }
  | { type: 'history'; customer: Customer; initialVehicleId?: string }
  | { type: 'workflow'; target: WorkflowRecord; requestedStatus?: BoardStatus };

interface CrmEditorDialogProps {
  editor: Editor;
  data: CrmWorkspace;
  onClose: () => void;
  onSelectOrder: (order: RepairOrder) => void;
  onBackToHistory?: (customer: Customer, vehicleId: string) => void;
}

export function CrmEditorDialog({
  editor,
  data,
  onClose,
  onSelectOrder,
  onBackToHistory
}: CrmEditorDialogProps) {
  const [state, setState] = useState<FormState>({ dirty: false, pending: false });
  const [materialsPending, setMaterialsPending] = useState(false);
  const [paymentState, setPaymentState] = useState<FormState>({ dirty: false, pending: false });
  const [economicsState, setEconomicsState] = useState<FormState>({ dirty: false, pending: false });
  const dirty = state.dirty || paymentState.dirty || economicsState.dirty;
  const busy = state.pending || materialsPending || paymentState.pending || economicsState.pending;
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
    editor.type === 'vehicleDetails'
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
                      : editor.order
                        ? `Замовлення №${editor.order.number}`
                        : editor.request
                          ? 'Створити замовлення із заявки'
                          : 'Нове замовлення';
  const description =
    editor.type === 'vehicleDetails'
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
                      : 'Перевірте автомобіль, додайте роботи та вартість кожної позиції.';
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
                ? 'sm:max-w-2xl'
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
              data-slot='crm-dialog-body'
              className='relative flex min-h-0 flex-col gap-5 overflow-y-auto overscroll-contain px-5 py-5 [scrollbar-gutter:stable] sm:px-6'
            >
              {denied ? (
                <p role='alert'>Ця дія доступна лише адміністратору.</p>
              ) : (
                <>
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
                  {editor.type === 'order' && (
                    <>
                      {backToHistory && (
                        <Button
                          type='button'
                          variant='outline'
                          className='self-start'
                          disabled={busy}
                          onClick={requestHistory}
                        >
                          <Icons.chevronLeft aria-hidden />
                          До автомобілів клієнта
                        </Button>
                      )}
                      {editor.order && (
                        <div className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3'>
                          <p className='text-sm text-muted-foreground'>
                            {dirty
                              ? 'Збережіть зміни перед друком.'
                              : 'Друк збереженого замовлення зі схемою кузова.'}
                          </p>
                          {dirty || busy ? (
                            <Button disabled variant='outline'>
                              Друк замовлення
                            </Button>
                          ) : (
                            <a
                              href={`/print/orders/${editor.order.id}`}
                              target='_blank'
                              rel='noopener noreferrer'
                              className={buttonVariants({ variant: 'outline' })}
                            >
                              Друк замовлення
                            </a>
                          )}
                        </div>
                      )}
                      {editor.order && (
                        <WorkflowDates target={{ kind: 'order', record: editor.order }} />
                      )}
                      {worker && editor.order ? (
                        <>
                          <OrderReadView order={editor.order} data={data} />
                          <ExecutorAdvance order={editor.order} {...props} />
                        </>
                      ) : (
                        <OrderForm
                          disabled={
                            paymentState.dirty ||
                            paymentState.pending ||
                            economicsState.dirty ||
                            economicsState.pending
                          }
                          data={data}
                          request={editor.request}
                          order={editor.order}
                          {...props}
                        />
                      )}
                      {editor.order && data.access && (
                        <OrderPayments
                          disabled={
                            state.dirty ||
                            state.pending ||
                            economicsState.dirty ||
                            economicsState.pending
                          }
                          orderId={editor.order.id}
                          data={data}
                          onStateChange={setPaymentState}
                        />
                      )}
                      {editor.order && data.access && (
                        <OrderEconomicsPanel
                          order={editor.order}
                          data={data}
                          disabled={
                            state.dirty ||
                            state.pending ||
                            paymentState.dirty ||
                            paymentState.pending ||
                            materialsPending
                          }
                          onSaved={props.onSaved}
                          onStateChange={setEconomicsState}
                        />
                      )}
                      {editor.order && data.access && (
                        <OrderMaterials
                          order={editor.order}
                          access={data.access}
                          onPendingChange={setMaterialsPending}
                        />
                      )}
                      {editor.order && (
                        <WorkflowHistory
                          target={{ kind: 'order', record: editor.order }}
                          data={data}
                        />
                      )}
                    </>
                  )}
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
              className='bg-muted/40 shrink-0 border-t px-5 py-4 sm:px-6'
              role='group'
              aria-label='Дії вікна'
            >
              {readOnly && (
                <div className='flex justify-end'>
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
