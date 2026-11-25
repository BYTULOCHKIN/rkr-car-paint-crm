import { expect, test } from '@playwright/test';

test('three roles use separate material costs and unpaid completion accrues the agreed example', async ({
  page
}, info) => {
  await page.goto('/dashboard/orders?flowDemo&economicsDemo');
  await page.evaluate(() => {
    sessionStorage.setItem(
      'stock-fixture',
      JSON.stringify({
        access: { userId: 'user_owner', orgId: 'org_test', role: 'admin' },
        items: [
          {
            id: '00000000-0000-4000-8000-000000000901',
            name: 'Матеріал тестовий',
            unit: 'л',
            tags: ['Розхідник'],
            notes: '',
            archived: false,
            locked: true,
            balanceMilli: 10000,
            totalCostCents: 2000000,
            valuationRevision: 0
          }
        ],
        movements: []
      })
    );
  });
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  const order = page.getByRole('dialog', { name: 'Замовлення №1', exact: true });
  await order.getByRole('combobox', { name: 'Відповідальний', exact: false }).click();
  await page.getByRole('option', { name: /Маляр Андрій/ }).click();
  await order.getByRole('tab', { name: 'Роботи', exact: true }).click();
  await order.getByRole('spinbutton', { name: 'Ціна за одиницю, грн', exact: false }).fill('20000');
  await order.getByRole('button', { name: 'Зберегти замовлення', exact: true }).click();
  await order.getByRole('tab', { name: 'Матеріали і субпідряд', exact: true }).click();
  for (const [quantity, purpose] of [
    ['1', 'Фарбування'],
    ['0,25', 'Полірування']
  ]) {
    await order.getByRole('button', { name: 'Додати списання', exact: true }).click();
    const operation = page.getByRole('dialog', { name: 'Нове списання', exact: true });
    await operation.getByRole('combobox', { name: 'Матеріал зі складу', exact: false }).click();
    await page.getByRole('option', { name: /^Матеріал тестовий/ }).click();
    await expect(operation.getByRole('textbox', { name: 'Кількість', exact: false })).toBeFocused();
    await operation.getByRole('textbox', { name: 'Кількість', exact: false }).fill(quantity);
    await operation.getByRole('button', { name: purpose, exact: true }).click();
    await operation.getByRole('button', { name: 'Списати', exact: true }).click();
    await expect(operation).toBeHidden();
  }
  await order.getByRole('button', { name: 'Додати субпідряд', exact: true }).click();
  const subcontract = page.getByRole('dialog', { name: 'Новий субпідряд', exact: true });
  await subcontract.getByRole('combobox', { name: 'Назва витрати', exact: false }).click();
  await page.getByRole('option', { name: 'Підбір фарби', exact: true }).click();
  await subcontract.getByRole('combobox', { name: 'Субпідрядник', exact: false }).click();
  await page.getByRole('option', { name: /^Олена Адміністратор/ }).click();
  await subcontract
    .getByRole('textbox', { name: 'Вартість субпідряду, грн', exact: false })
    .fill('1000');
  await subcontract.getByRole('button', { name: 'Зберегти витрату', exact: true }).click();
  await expect(subcontract).toBeHidden();
  await order.getByRole('tab', { name: 'Команда і зарплата', exact: true }).click();
  for (const [role, name] of [
    ['Полірувальник', /^Маляр Андрій/],
    ['Розбірник-збірник', /^Олена Адміністратор/]
  ] as const) {
    await order.getByRole('combobox', { name: role, exact: false }).click();
    await page.getByRole('option', { name }).click();
    await expect(page.getByRole('combobox', { name: `Пошук: ${role}`, exact: true })).toBeHidden();
  }
  await order.getByRole('textbox', { name: 'Сума полірування, грн', exact: false }).fill('2000');
  await order
    .getByRole('textbox', { name: 'Сума розбірки-збірки, грн', exact: false })
    .fill('2000');
  await expect(
    order.getByRole('region', { name: 'Результат розрахунку', exact: true })
  ).toContainText('6\u00a0600,00');
  await order.getByRole('button', { name: 'Зберегти умови нарахування', exact: true }).click();
  await expect(
    order.getByRole('tab', { name: 'Команда і зарплата', exact: true })
  ).not.toHaveAttribute('data-dirty');
  expect(await order.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true
  );
  await page.screenshot({ path: info.outputPath('role-salary.png'), animations: 'disabled' });
  await page.goto('/dashboard/orders?flowDemo&role=worker');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  await page.getByRole('button', { name: 'Позначити готовим', exact: true }).click();
  await expect(page.getByText('Замовлення готове.', { exact: true })).toBeVisible();
  await page.goto('/dashboard/payroll?flowDemo');
  const table = page.getByRole('table', { name: 'Зарплати команди', exact: true });
  await expect(table.getByRole('row').filter({ hasText: 'Маляр Андрій' })).toContainText(
    '8 700,00'
  );
  await expect(table.getByRole('row').filter({ hasText: 'Олена Адміністратор' })).toContainText(
    '1 200,00'
  );
  await table.getByRole('button', { name: 'Зарплата: Маляр Андрій', exact: true }).click();
  const payroll = page.getByRole('dialog', { name: 'Зарплата — Маляр Андрій', exact: true });
  await expect(payroll).toContainText('Полірувальник');
  await expect(payroll).toContainText('Маляр');
});
