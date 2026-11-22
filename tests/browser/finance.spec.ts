import { expect, test } from '@playwright/test';

test('posted payroll accepts payment and previews a material correction before showing overpayment', async ({
  page
}, info) => {
  await page.goto('/dashboard/orders?financeDemo');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  const payroll = page.getByRole('region', { name: 'Нарахування та виплати' });
  await expect(payroll).toContainText('До виплати: 8\u00a0400,00');
  await payroll.getByRole('button', { name: 'Записати виплату / аванс', exact: true }).click();
  await payroll.getByRole('combobox', { name: 'Одержувач' }).click();
  await page.getByRole('option', { name: 'Маляр Андрій · Працівник', exact: true }).click();
  await payroll.getByRole('textbox', { name: 'Сума виплати / авансу, грн' }).fill('8400');
  await payroll.getByRole('button', { name: 'Зберегти фінансову операцію' }).click();
  await expect(payroll).toContainText('Виплачено: 8\u00a0400,00');
  await payroll.getByRole('button', { name: 'Фінансове коригування', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Причина фінансового коригування' })
    .fill('Враховано додатковий матеріал');
  await page.getByRole('button', { name: 'Додати матеріал до коригування' }).click();
  await page.getByRole('combobox', { name: 'Матеріал 1' }).click();
  await page.getByRole('option', { name: /^Фарба ·/ }).click();
  await page.getByRole('textbox', { name: 'Кількість матеріалу 1' }).fill('1');
  await page.getByRole('button', { name: 'Переглянути коригування' }).click();
  const review = page.getByRole('region', { name: 'Перегляд фінансового коригування' });
  await expect(review).toContainText('Маляр Андрій: -600,00');
  await expect(review).toContainText('виплати');
  await review.getByRole('button', { name: 'Провести коригування', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await expect(payroll).toContainText('Аванс / переплата: 600,00');
  await expect(payroll).toContainText('версія 2');
  await payroll.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath('finance-correction.png'),
    animations: 'disabled'
  });
  expect(
    await page
      .getByRole('dialog')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
  ).toBe(true);
});

test('a corrected check exposes client overpayment and records a real partial refund', async ({
  page
}) => {
  await page.goto('/dashboard/orders?financeDemo');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await page.getByRole('button', { name: 'Фінансове коригування', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Причина фінансового коригування' })
    .fill('Уточнено фінальний чек');
  await page
    .getByRole('form', { name: 'Редагування деталізованого чека' })
    .getByRole('textbox', { name: 'Ціна за одиницю, грн' })
    .fill('17000');
  await page.getByRole('button', { name: 'Переглянути коригування' }).click();
  await page.getByRole('button', { name: 'Провести коригування', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  const payments = page.getByRole('region', { name: 'Оплати замовлення' });
  await expect(payments).toContainText('Переплата клієнта: 1\u00a0000,00');
  await payments.getByRole('button', { name: 'Записати повернення клієнту' }).click();
  await payments.getByRole('textbox', { name: 'Сума повернення клієнту, грн' }).fill('400');
  await payments
    .getByRole('textbox', { name: 'Підстава повернення клієнту' })
    .fill('Фактично повернуто 400 грн');
  await payments.getByRole('button', { name: 'Підтвердити повернення клієнту' }).click();
  await expect(payments).toContainText('Переплата клієнта: 600,00');
  await expect(payments).toContainText('Фактично повернуто 400 грн');
});

test('worker sees posted economics and own ledger without payment or correction controls', async ({
  page
}) => {
  await page.goto('/dashboard/orders?financeDemo&role=worker');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  const payroll = page.getByRole('region', { name: 'Нарахування та виплати' });
  await expect(payroll).toContainText('Маляр Андрій');
  await expect(payroll).toContainText('Нараховано: 8\u00a0400,00');
  await expect(payroll).not.toContainText('Олена Адміністратор');
  await expect(payroll.getByRole('button')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Фінансове коригування', exact: true })
  ).toHaveCount(0);
});
