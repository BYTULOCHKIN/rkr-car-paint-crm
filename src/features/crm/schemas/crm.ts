import { z } from 'zod';
import { businessToday } from '../lib/workflow';

const optionalDate = z.union([z.iso.date('Вкажіть коректну дату'), z.literal('')]);
const planningFields = {
  plannedIntakeDate: optionalDate.optional(),
  plannedDeliveryDate: optionalDate.optional()
};

const text = (label: string, max = 200) =>
  z.string().trim().min(1, `${label}: обов’язкове поле`).max(max, `Максимум ${max} символів`);
const id = z.string().uuid('Виберіть запис зі списку');

export const customerSchema = z.object({
  name: text('Ім’я'),
  phone: text('Телефон', 40).regex(/^[+\d\s()-]{7,40}$/, 'Вкажіть коректний телефон'),
  notes: z.string().trim().max(2000)
});

export const vinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'VIN має містити 17 латинських літер і цифр, без I, O, Q');

export const vehicleSchema = z.object({
  customerId: z.union([id, z.literal('')]),
  make: text('Марка', 80),
  model: text('Модель', 80),
  year: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear() + 1),
  plate: z.string().trim().max(30),
  vin: z.union([vinSchema, z.literal('')])
});

const requestFields = z.object({
  customerId: id,
  vehicleId: id,
  description: text('Опис робіт', 4000),
  ...planningFields
});

function validatePlanning(
  value: { plannedIntakeDate?: string; plannedDeliveryDate?: string },
  ctx: z.RefinementCtx
): void {
  if (
    value.plannedIntakeDate &&
    value.plannedDeliveryDate &&
    value.plannedDeliveryDate < value.plannedIntakeDate
  )
    ctx.addIssue({
      code: 'custom',
      path: ['plannedDeliveryDate'],
      message: 'Запланована видача не може бути раніше запланованого прийому'
    });
}

export const requestSchema = requestFields.superRefine(validatePlanning);

export const itemSchema = z.object({
  description: text('Назва роботи', 300),
  quantity: z.number().int('Кількість має бути цілою').min(1).max(999),
  unitPrice: z
    .number()
    .finite()
    .min(0, 'Ціна не може бути від’ємною')
    .max(1000000)
    .refine(
      (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
      'Ціна має містити не більше двох знаків після коми'
    )
});

export const orderSchema = requestFields
  .extend({
    requestId: z.union([id, z.literal('')]),
    items: z.array(itemSchema).min(1, 'Додайте хоча б одну роботу').max(100),
    actualIntakeDate: z.iso.date('Вкажіть фактичну дату прийому').optional()
  })
  .superRefine((value, ctx) => {
    validatePlanning(value, ctx);
    if (value.actualIntakeDate && value.actualIntakeDate > businessToday())
      ctx.addIssue({
        code: 'custom',
        path: ['actualIntakeDate'],
        message: 'Фактична дата прийому не може бути в майбутньому'
      });
  });

export const updateOrderSchema = z.object({
  id,
  description: text('Опис робіт', 4000),
  items: orderSchema.shape.items
});

export const updateVinSchema = z.object({ id, vin: vinSchema });

export const workflowSchema = z
  .object({
    kind: z.enum(['request', 'order']),
    id,
    expectedStatus: z.string(),
    status: z.enum(['backlog', 'scheduled', 'in_progress', 'ready', 'delivered']),
    plannedIntakeDate: optionalDate,
    plannedDeliveryDate: optionalDate,
    actualIntakeDate: optionalDate,
    actualReadyDate: optionalDate,
    actualDeliveryDate: optionalDate,
    note: z.string().trim().max(2000)
  })
  .superRefine((value, ctx) => {
    const issue = (field: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [field], message });
    if (
      value.plannedIntakeDate &&
      value.plannedDeliveryDate &&
      value.plannedDeliveryDate < value.plannedIntakeDate
    )
      issue('plannedDeliveryDate', 'Запланована видача не може бути раніше запланованого прийому');
    if (value.kind === 'request') {
      if (!['backlog', 'scheduled'].includes(value.status))
        issue('status', 'Спочатку створіть замовлення');
      if (value.status === 'scheduled' && !value.plannedIntakeDate)
        issue('plannedIntakeDate', 'Для запису вкажіть дату прийому');
      if (value.status === 'backlog' && value.plannedIntakeDate)
        issue('plannedIntakeDate', 'Для дати прийому виберіть статус «Заплановано»');
    } else {
      if (!['in_progress', 'ready', 'delivered'].includes(value.status))
        issue('status', 'Замовлення не можна повернути в заявки');
      if (!value.actualIntakeDate) issue('actualIntakeDate', 'Вкажіть фактичну дату прийому');
      if (['ready', 'delivered'].includes(value.status) && !value.actualReadyDate)
        issue('actualReadyDate', 'Вкажіть фактичну дату готовності');
      if (value.status === 'delivered' && !value.actualDeliveryDate)
        issue('actualDeliveryDate', 'Вкажіть фактичну дату видачі');
      for (const field of ['actualIntakeDate', 'actualReadyDate', 'actualDeliveryDate'] as const) {
        if (value[field] > businessToday())
          issue(field, 'Фактична дата не може бути в майбутньому');
      }
      if (
        value.actualReadyDate &&
        value.actualIntakeDate &&
        value.actualReadyDate < value.actualIntakeDate
      )
        issue('actualReadyDate', 'Дата готовності не може бути раніше прийому');
      if (
        value.actualDeliveryDate &&
        value.actualReadyDate &&
        value.actualDeliveryDate < value.actualReadyDate
      )
        issue('actualDeliveryDate', 'Дата видачі не може бути раніше готовності');
      if (value.status === 'in_progress' && (value.actualReadyDate || value.actualDeliveryDate))
        issue('status', 'Для статусу «У роботі» очистьте дати готовності та видачі');
      if (value.status === 'ready' && value.actualDeliveryDate)
        issue('actualDeliveryDate', 'Для статусу «Готово» очистьте дату видачі');
    }
  });
export type WorkflowInput = z.infer<typeof workflowSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type VehicleInput = z.infer<typeof vehicleSchema>;
export type RequestInput = z.infer<typeof requestSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
