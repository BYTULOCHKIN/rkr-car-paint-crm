export const ORDER_TABS = [
  {
    value: 'main',
    label: 'Основне',
    description: 'Клієнт, автомобіль, відповідальний, статус і дати.'
  },
  { value: 'works', label: 'Роботи', description: 'Схема фарбування, послуги, ціни та виконавці.' },
  {
    value: 'materials',
    label: 'Матеріали',
    description: 'Списання матеріалів на авто та їхня собівартість.'
  },
  {
    value: 'payments',
    label: 'Оплати',
    description: 'Платежі клієнта, залишок до сплати та повернення коштів.'
  },
  {
    value: 'economics',
    label: 'Економіка',
    description: 'Внутрішній розрахунок, нарахування, виплати та коригування.'
  },
  {
    value: 'history',
    label: 'Історія',
    description: 'Зміни замовлення, автори та причини виправлень.'
  }
] as const;

export type OrderTab = (typeof ORDER_TABS)[number]['value'];
