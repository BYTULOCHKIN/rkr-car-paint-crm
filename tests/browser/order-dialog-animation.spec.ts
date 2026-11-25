import { expect, test } from '@playwright/test';

async function openMaterials(page: import('@playwright/test').Page) {
  await page.goto('/dashboard/orders');
  await page.getByRole('button', { name: 'Відкрити замовлення №1', exact: true }).click();
  const order = page.getByRole('dialog', {
    name: 'Замовлення №1',
    exact: true,
    includeHidden: true
  });
  await order.getByRole('tab', { name: 'Матеріали і субпідряд', exact: true }).click();
  const add = order.getByRole('button', { name: 'Додати списання', exact: true });
  await expect(add).toBeVisible();
  return { order, add };
}

test('nested dialog moves the parent back, uses one backdrop and retains DOM for its exit transition', async ({
  page
}, info) => {
  const { order, add } = await openMaterials(page);
  await expect(order).toHaveCSS('scale', '1');
  await add.click();
  const child = page.getByRole('dialog', { name: 'Нове списання', exact: true });
  await expect(child).toBeVisible();
  await expect(order).toHaveAttribute('data-nested-dialog-open', '');
  await expect(order).toHaveCSS('scale', '0.9');
  await expect(page.locator('[data-crm-dialog-backdrop]')).toHaveCount(1);
  const modalBounds = await child.boundingBox();
  expect(modalBounds!.x).toBeGreaterThanOrEqual(0);
  expect(modalBounds!.x + modalBounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.screenshot({
    path: info.outputPath('nested-material-dialog.png'),
    animations: 'disabled'
  });
  const closing = await child
    .getByRole('button', { name: 'Скасувати', exact: true })
    .evaluate(async (button) => {
      (button as HTMLButtonElement).click();
      await new Promise(requestAnimationFrame);
      const popup = button.closest('[data-crm-dialog]')!;
      return {
        connected: popup.isConnected,
        ending: popup.hasAttribute('data-ending-style'),
        duration: getComputedStyle(popup).transitionDuration
      };
    });
  expect(closing.connected).toBe(true);
  expect(closing.ending).toBe(true);
  expect(closing.duration).not.toBe('0s');
  await expect(child).toBeHidden();
  await expect(order).toBeVisible();
  await expect(order).toHaveCSS('scale', '1');
  await expect(add).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(order).toBeHidden();
});

test('Escape closes only the top dialog and reduced motion disables its transitions', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { order, add } = await openMaterials(page);
  await add.click();
  const child = page.getByRole('dialog', { name: 'Нове списання', exact: true });
  await expect(child).toBeVisible();
  await expect(child).toHaveCSS('transition-duration', '0s');
  await expect(order).toHaveCSS('transition-duration', '0s');
  await page.keyboard.press('Escape');
  await expect(child).toBeHidden();
  await expect(order).toBeVisible();
  await expect(add).toBeFocused();
});
