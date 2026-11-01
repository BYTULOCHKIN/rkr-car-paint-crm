'use client';

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
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
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
import { money, vehicleLabel } from './format';
import type { FormState } from './form-status';
import { WorkflowForm } from './workflow-form';
import { WorkflowDates, WorkflowHistory } from './workflow-details';
import { VehicleOwnerForm } from './vehicle-owner-form';
import { VehicleDetails, DeleteVehicle } from './vehicle-details';
import { DialogFormContext } from './dialog-form';

export type Editor =
  | { type: 'vehicleDetails'; vehicle: Vehicle }
  | { type: 'deleteVehicle'; vehicle: Vehicle }
  | { type: 'owner'; vehicle: Vehicle }
  | { type: 'customer' }
  | { type: 'vehicle'; customer?: Customer; vehicle?: Vehicle }
  | { type: 'vin'; vehicle: Vehicle }
  | { type: 'request' }
  | { type: 'order'; request?: RepairRequest; order?: RepairOrder }
  | { type: 'history'; customer: Customer }
  | { type: 'workflow'; target: WorkflowRecord; requestedStatus?: BoardStatus };

interface CrmEditorDialogProps {
  editor: Editor;
  data: CrmWorkspace;
  onClose: () => void;
  onSelectOrder: (order: RepairOrder) => void;
}

export function CrmEditorDialog({ editor, data, onClose, onSelectOrder }: CrmEditorDialogProps) {
  const [state, setState] = useState<FormState>({ dirty: false, pending: false });
  const [discard, setDiscard] = useState(false);
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);
  const formId = useId();
  const formLayout = useMemo(() => ({ formId, footer }), [formId, footer]);
  const readOnly = editor.type === 'history' || editor.type === 'vehicleDetails';
  useEffect(() => {
    if (!state.dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [state.dirty]);

  function requestClose(): void {
    if (state.pending) return;
    if (state.dirty) setDiscard(true);
    else onClose();
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
              ? 'Новий клієнт'
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
                          ? 'Взяти заявку в роботу'
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
              ? 'Додайте контактні дані клієнта.'
              : editor.type === 'vehicle'
                ? 'Виберіть марку, модель та рік автомобіля.'
                : editor.type === 'vin'
                  ? 'Вкажіть VIN, щоб автомобіль можна було взяти в роботу.'
                  : editor.type === 'request'
                    ? 'Виберіть клієнта, його автомобіль та опишіть потрібні роботи.'
                    : editor.type === 'history'
                      ? 'Замовлення окремо для кожного автомобіля клієнта.'
                      : 'Перевірте автомобіль, додайте роботи та вартість кожної позиції.';
  const props = { onSaved: onClose, onCancel: requestClose, onStateChange: setState };

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
            editor.type === 'order' || editor.type === 'history' ? 'sm:max-w-2xl' : 'sm:max-w-lg'
          )}
        >
          <Button
            type='button'
            variant='ghost'
            size='icon-sm'
            className='absolute top-2 right-2'
            aria-label='Закрити'
            disabled={state.pending}
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
              {editor.type === 'customer' && <CustomerForm {...props} />}
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
                  <WorkflowForm
                    target={editor.target}
                    requestedStatus={editor.requestedStatus}
                    {...props}
                  />
                  <WorkflowHistory target={editor.target} data={data} />
                </>
              )}
              {editor.type === 'order' && (
                <>
                  {editor.order && (
                    <WorkflowDates target={{ kind: 'order', record: editor.order }} />
                  )}
                  <OrderForm data={data} request={editor.request} order={editor.order} {...props} />
                  {editor.order && (
                    <WorkflowHistory target={{ kind: 'order', record: editor.order }} data={data} />
                  )}
                </>
              )}
              {editor.type === 'history' && (
                <div className='flex flex-col gap-4'>
                  <div className='flex flex-col gap-2 rounded-lg border p-4 text-sm'>
                    <a
                      href={`tel:${editor.customer.phone}`}
                      className='w-fit underline underline-offset-4'
                    >
                      {editor.customer.phone}
                    </a>
                    {editor.customer.notes && (
                      <p className='text-muted-foreground break-words whitespace-pre-wrap'>
                        {editor.customer.notes}
                      </p>
                    )}
                  </div>
                  {!data.vehicles.some((vehicle) => vehicle.customerId === editor.customer.id) && (
                    <Empty>
                      <EmptyHeader>
                        <EmptyTitle>Автомобілів ще немає</EmptyTitle>
                        <EmptyDescription>
                          Додайте перший автомобіль у рядку клієнта.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                  {data.vehicles
                    .filter((vehicle) => vehicle.customerId === editor.customer.id)
                    .map((vehicle) => {
                      const history = data.orders.filter((order) => order.vehicleId === vehicle.id);
                      return (
                        <section
                          key={vehicle.id}
                          className='flex flex-col gap-2 rounded-lg border p-4'
                        >
                          <h3 className='font-medium'>{vehicleLabel(vehicle)}</h3>
                          <p className='text-muted-foreground font-mono text-xs'>
                            {vehicle.vin || 'VIN ще не додано'}
                          </p>
                          {history.length ? (
                            history.map((order) => (
                              <Button
                                key={order.id}
                                variant='outline'
                                onClick={() => onSelectOrder(order)}
                              >
                                №{order.number} ·{' '}
                                {new Intl.DateTimeFormat('uk-UA').format(new Date(order.createdAt))}{' '}
                                · {money(order.totalCents)}
                              </Button>
                            ))
                          ) : (
                            <p className='text-muted-foreground text-sm'>Замовлень ще немає.</p>
                          )}
                        </section>
                      );
                    })}
                </div>
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
                  <Button variant='outline' onClick={requestClose}>
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
            <Button variant='destructive' onClick={onClose}>
              Скасувати зміни
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
