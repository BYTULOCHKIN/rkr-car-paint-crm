import { test, expect } from '@playwright/test';

for (const route of ['overview']) {
  test(`${route}: hover retains a stable target at the bottom edge and pressing scales only the card`, async ({
    page
  }) => {
    await page.goto(`/dashboard/${route}`);
    const target = page.locator('[data-slot=card]').first().locator('..');
    const visual = target.locator('[data-slot=card]');
    await expect(target).toHaveAttribute('href', /\/dashboard\//);
    const initial = (await target.boundingBox())!;
    await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height - 1);
    await expect
      .poll(() => visual.evaluate((element) => getComputedStyle(element).translate))
      .toBe('0px -2px');
    await visual.evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished))
    );
    const samples = await target.evaluate(async (element) => {
      const rect = element.getBoundingClientRect();
      const results: boolean[] = [];
      for (let index = 0; index < 20; index++) {
        await new Promise(requestAnimationFrame);
        const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height - 1);
        results.push(hit === element && getComputedStyle(hit).cursor === 'pointer');
      }
      return results;
    });
    expect(samples.every(Boolean)).toBe(true);
    await page.mouse.down();
    await expect
      .poll(() => visual.evaluate((element) => parseFloat(getComputedStyle(element).scale)))
      .toBeCloseTo(0.98, 2);
    expect(await target.boundingBox()).toEqual(initial);
    await page.mouse.move(initial.x + initial.width + 12, initial.y + initial.height + 12);
    await page.mouse.up();
    await expect
      .poll(() =>
        visual.evaluate((element) => {
          const scale = getComputedStyle(element).scale;
          return scale === 'none' ? 1 : parseFloat(scale);
        })
      )
      .toBeCloseTo(1, 2);
  });
}

test('reduced motion keeps cards stationary and the whole card still navigates', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dashboard/overview');
  const target = page.getByRole('link', { name: /^Активні заявки: / });
  const visual = target.locator('[data-slot=card]');
  await target.hover();
  await page.mouse.down();
  expect(
    await visual.evaluate((element) => ({
      translate: getComputedStyle(element).translate,
      scale: getComputedStyle(element).scale
    }))
  ).toEqual({ translate: 'none', scale: 'none' });
  await page.mouse.up();
  await expect(page).toHaveURL(/\/dashboard\/requests$/);
});
