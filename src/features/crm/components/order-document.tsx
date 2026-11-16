import type { OrderDocument as OrderDocumentData } from '../api/types';
import { bodyParts, partLabel, paintModeLabel } from '../constants/paint-plan';
import { displayDate, statusLabel } from '../lib/workflow';
import { assigneeLabel } from '../lib/assignee';
import { money, vehicleLabel } from './format';
import { BodyDiagram } from './body-diagram';
import { PaintLegend } from './paint-legend';
import styles from './order-document.module.css';

interface OrderDocumentProps {
  document: OrderDocumentData;
}

export function OrderDocument({ document: { order, customer, vehicle } }: OrderDocumentProps) {
  const plan = order.paintPlan ?? [];
  return (
    <article className={styles.document}>
      <header className={styles.header}>
        <div>
          <p>АВТОМАЛЯРКА · ЗАМОВЛЕННЯ</p>
          <h1>Замовлення №{order.number}</h1>
        </div>
        <div>
          <strong>{statusLabel(order.status)}</strong>
          <p>Створено: {displayDate(order.createdAt.slice(0, 10))}</p>
        </div>
      </header>
      <section className={styles.details}>
        <div>
          <h2>Клієнт</h2>
          <p>{customer.name}</p>
          <p>{customer.phone}</p>
        </div>
        <div>
          <h2>Автомобіль</h2>
          <p>
            {vehicleLabel(vehicle)}
            {vehicle.year ? ` · ${vehicle.year} р.` : ''}
          </p>
          <p>VIN: {vehicle.vin || '—'}</p>
        </div>
        <div>
          <h2>Дати виконання</h2>
          <p>Прийом: {displayDate(order.actualIntakeDate)}</p>
          <p>Готовність: {displayDate(order.actualReadyDate)}</p>
          <p>Видача: {displayDate(order.actualDeliveryDate)}</p>
        </div>
      </section>
      <section>
        <h2>Виконавець</h2>
        <p>{assigneeLabel(order)}</p>
      </section>
      <section>
        <h2>Опис замовлення</h2>
        <p className={styles.description}>{order.description}</p>
      </section>
      <section>
        <h2>Позиції робіт</h2>
        <table>
          <thead>
            <tr>
              <th>№</th>
              <th>Робота</th>
              <th>К-сть</th>
              <th>Ціна</th>
              <th>Сума</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, index) => (
              <tr key={index}>
                <td>{index + 1}</td>
                <td>{item.description}</td>
                <td>{item.quantity}</td>
                <td>{money(item.unitPriceCents)}</td>
                <td>{money(item.quantity * item.unitPriceCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.total}>Разом: {money(order.totalCents)}</p>
      </section>
      <section className={styles.scheme}>
        <h2>Схема фарбування кузова</h2>
        <PaintLegend />
        <BodyDiagram value={plan} />
        {plan.length ? (
          <ol className={styles.parts}>
            {bodyParts
              .filter((part) => plan.some((entry) => entry.partId === part.id))
              .map((part) => (
                <li key={part.id} value={bodyParts.findIndex((entry) => entry.id === part.id) + 1}>
                  <strong>{partLabel(part.id)}</strong> —{' '}
                  {paintModeLabel(plan.find((entry) => entry.partId === part.id)!.mode)}
                </li>
              ))}
          </ol>
        ) : (
          <p>Деталі для фарбування не позначені.</p>
        )}
      </section>
      <footer className={styles.signatures}>
        <p>Виконавець: __________________</p>
        <p>Клієнт: __________________</p>
      </footer>
    </article>
  );
}
