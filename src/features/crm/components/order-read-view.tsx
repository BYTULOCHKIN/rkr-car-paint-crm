import type { CrmWorkspace, RepairOrder } from '../api/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { assigneeLabel } from '../lib/assignee';
import { primaryContact } from '../lib/customer-contacts';
import { money, vehicleLabel } from './format';
import { VehicleBrandAvatar } from '@/components/vehicle-brand-avatar';
import { BodyDiagram } from './body-diagram';
import { PaintLegend } from './paint-legend';

export function OrderReadView({
  order,
  data,
  section = 'all'
}: {
  order: RepairOrder;
  data: CrmWorkspace;
  section?: 'all' | 'main' | 'works';
}) {
  const customer = data.customers.find((customer) => customer.id === order.customerId);
  const vehicle = data.vehicles.find((vehicle) => vehicle.id === order.vehicleId);
  return (
    <div className='flex min-w-0 flex-col gap-5'>
      {section !== 'works' && (
        <>
          <section className='rounded-lg border p-3 text-sm'>
            <p className='font-medium'>
              {customer?.name} · {primaryContact(customer)}
            </p>
            {vehicle && (
              <div className='my-2 flex items-center gap-2'>
                <VehicleBrandAvatar make={vehicle.make} />
                <p className='min-w-0 flex-1 break-words [overflow-wrap:anywhere]'>
                  {vehicleLabel(vehicle)}
                </p>
              </div>
            )}
            <p className='font-mono'>{vehicle?.vin}</p>
            <p className='mt-2'>
              Відповідальний: <strong>{assigneeLabel(order, data.team)}</strong>
            </p>
          </section>
          <section>
            <h3 className='mb-2 font-semibold'>Опис замовлення</h3>
            <p className='whitespace-pre-wrap [overflow-wrap:anywhere]'>{order.description}</p>
          </section>
        </>
      )}
      {section !== 'main' && (
        <>
          <section>
            <h3 className='mb-2 font-semibold'>Роботи та вартість · лише читання</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Робота</TableHead>
                  <TableHead>К-сть</TableHead>
                  <TableHead>Ціна</TableHead>
                  <TableHead>Сума</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className='whitespace-normal [overflow-wrap:anywhere]'>
                      {item.description}
                    </TableCell>
                    <TableCell>{item.quantity}</TableCell>
                    <TableCell className='whitespace-nowrap'>
                      {money(item.unitPriceCents)}
                    </TableCell>
                    <TableCell className='whitespace-nowrap'>
                      {money(item.quantity * item.unitPriceCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className='mt-3 text-right font-semibold'>Разом: {money(order.totalCents)}</p>
          </section>
          <section>
            <h3 className='mb-3 font-semibold'>Схема фарбування</h3>
            <PaintLegend />
            <BodyDiagram value={order.paintPlan ?? []} />
          </section>
        </>
      )}
    </div>
  );
}
