import { z } from 'zod';
import { normalizeContact } from '../lib/customer-contacts';
import { phoneNumberError } from '@/lib/phone-number';
import { bodyParts } from '../constants/paint-plan';
import { businessToday } from '../lib/workflow';

const optionalDate = z.union([z.iso.date('Вкажіть коректну дату'), z.literal('')]);
const planningFields = {
  plannedIntakeDate: optionalDate.optional(),
  plannedDeliveryDate: optionalDate.optional()
};

const text = (label: string, max = 200) =>
  z.string().trim().min(1, `${label}: обов’язкове поле`).max(max, `Максимум ${max} символів`);
const orderDescription = z.string().trim().max(4000, 'Максимум 4000 символів');
const id = z.string().uuid('Виберіть запис зі списку');

export const contactSchema = z
  .object({
    type: z.enum(['phone', 'email']),
    value: z.string().trim().min(1, 'Вкажіть контакт').max(254)
  })
  .superRefine((contact, ctx) => {
    const valid =
      contact.type === 'email'
        ? z.email().safeParse(contact.value).success
        : !phoneNumberError(contact.value);
    if (!valid)
      ctx.addIssue({
        code: 'custom',
        path: ['value'],
        message:
          contact.type === 'email' ? 'Вкажіть коректний email' : phoneNumberError(contact.value)!
      });
  });
export const customerFields = z.object({
  name: text('Ім’я'),
  phone: z.string().trim().max(40).optional(),
  contacts: z.array(contactSchema).max(20, 'Максимум 20 контактів').optional(),
  notes: z.string().trim().max(2000)
});
function validateContacts(value: z.infer<typeof customerFields>, ctx: z.RefinementCtx): void {
  const contacts =
    value.contacts ?? (value.phone ? [{ type: 'phone' as const, value: value.phone }] : []);
  if (!contacts.length)
    ctx.addIssue({
      code: 'custom',
      path: ['contacts'],
      message: 'Додайте хоча б один телефон або email'
    });
  const seen = new Set<string>();
  contacts.forEach((contact, index) => {
    const parsed = contactSchema.safeParse(contact);
    if (!parsed.success && value.contacts === undefined)
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Вкажіть коректний телефон' });
    const key = `${contact.type}:${normalizeContact(contact.type, contact.value)}`;
    if (seen.has(key))
      ctx.addIssue({
        code: 'custom',
        path: ['contacts', index, 'value'],
        message: 'Цей контакт уже додано'
      });
    seen.add(key);
  });
}
export const customerSchema = customerFields.superRefine(validateContacts);
export const customerEditorSchema = customerFields
  .omit({ phone: true })
  .extend({ contacts: z.array(contactSchema).min(1, 'Додайте хоча б один контакт').max(20) })
  .superRefine(validateContacts);
export const updateCustomerSchema = customerFields
  .extend({ id, expectedRevision: z.number().int().nonnegative() })
  .superRefine(validateContacts);
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

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

export const paintPlanSchema = z
  .array(
    z.object({
      partId: z
        .string()
        .refine((id) => bodyParts.some((part) => part.id === id), 'Невідома деталь кузова'),
      mode: z.enum(['both_sides', 'one_side', 'partial'])
    })
  )
  .max(bodyParts.length)
  .refine(
    (parts) => new Set(parts.map((part) => part.partId)).size === parts.length,
    'Деталі кузова не можуть повторюватися'
  );

export const orderSchema = requestFields
  .extend({
    description: orderDescription,
    requestId: z.union([id, z.literal('')]),
    assigneeId: z.string().min(1, 'Виберіть виконавця').max(255).optional(),
    employeeShareBps: z.number().int().min(0).max(10000).optional(),
    paintPlan: paintPlanSchema.optional(),
    items: z.array(itemSchema).min(1, 'Додайте хоча б одну роботу').max(100),
    actualIntakeDate: optionalDate.optional()
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
  expectedRevision: z.number().int().nonnegative().optional(),
  assigneeId: z.string().min(1, 'Виберіть виконавця').max(255).optional(),
  employeeShareBps: z.number().int().min(0).max(10000).optional(),
  description: orderDescription,
  items: orderSchema.shape.items,
  paintPlan: paintPlanSchema.optional()
});

export const updateVinSchema = z.object({ id, vin: vinSchema });

export const workflowSchema = z
  .object({
    kind: z.enum(['request', 'order']),
    id,
    expectedStatus: z.string(),
    expectedRevision: z.number().int().nonnegative().optional(),
    status: z.enum(['backlog', 'scheduled', 'created', 'in_progress', 'ready']),
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
      if (!['created', 'in_progress', 'ready'].includes(value.status))
        issue('status', 'Замовлення не можна повернути в заявки');
      if (value.status !== 'created' && !value.actualIntakeDate)
        issue('actualIntakeDate', 'Вкажіть фактичну дату прийому');
      if (value.status === 'ready' && !value.actualReadyDate)
        issue('actualReadyDate', 'Вкажіть фактичну дату готовності');
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
      if (
        ['created', 'in_progress'].includes(value.status) &&
        (value.actualReadyDate || value.actualDeliveryDate)
      )
        issue('status', 'Для статусу «У роботі» очистьте дати готовності та видачі');
    }
  });
export type WorkflowInput = z.infer<typeof workflowSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type VehicleInput = z.infer<typeof vehicleSchema>;
export type RequestInput = z.infer<typeof requestSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;

export const advanceOrderSchema = z
  .object({
    id,
    expectedStatus: z.enum(['created', 'in_progress', 'ready', 'delivered']),
    expectedRevision: z.number().int().nonnegative()
  })
  .strict();
export type AdvanceOrderInput = z.infer<typeof advanceOrderSchema>;
