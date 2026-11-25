export const ORDER_TABS = [
  {
    value: 'main',
    label: 'Основне',
    description: 'Клієнт, автомобіль, відповідальний, статус і дати.'
  },
  { value: 'works', label: 'Роботи', description: 'Перелік робіт і ціни для клієнта.' },
  {
    value: 'materials',
    label: 'Матеріали і субпідряд',
    description: 'Матеріали зі складу та витрати на субпідрядників.'
  },
  {
    value: 'labor',
    label: 'Команда і зарплата',
    description: 'Виконавці, внутрішні суми робіт та нарахування за ролями.'
  },
  {
    value: 'payments',
    label: 'Оплати',
    description: 'Платежі клієнта, залишок до сплати та повернення коштів.'
  },
  {
    value: 'history',
    label: 'Історія',
    description: 'Зміни замовлення, автори та причини виправлень.'
  }
] as const;

export type OrderTab = (typeof ORDER_TABS)[number]['value'];
