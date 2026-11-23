import { expect, test } from '@playwright/test';

test('monthly card trends show real percentages, daily lines and favorable debt reduction', async ({
  page
}, info) => {
  await page.clock.setFixedTime(new Date('2026-11-17T10:00:00Z'));
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/dashboard/overview?trendDemo');
  await expect(page.locator('[data-slot=metric-trend]')).toHaveCount(7);
  const receipts = page.getByRole('link', { name: /^Надходження за місяць:/ });
  await expect(receipts).toContainText('+100%');
  await expect(receipts.locator('[data-slot=card-title]')).toHaveText('20K грн');
  await expect(receipts).toHaveAttribute('aria-label', /20\s000,00\sгрн/);
  const pending = page.getByRole('link', { name: /^До сплати за відкритими авто:/ });
  await expect(pending.locator('[data-slot=card-title]')).toHaveText('1.4M грн');
  await expect(pending.locator('[data-slot=metric-trend] > span')).toHaveText('+1.4M грн');
  await expect(page.getByText(/Попередній період:/)).toHaveCount(0);
  const debt = page.getByRole('link', { name: /^Заборгованість за готовими авто:/ });
  await expect(debt).toContainText(/[-−]40%/);
  await expect(debt.locator('[data-slot=metric-trend] span').first()).toHaveClass(/text-emerald/);
  const chart = receipts.getByRole('img', {
    name: 'Надходження за місяць: динаміка за поточний місяць'
  });
  await expect(chart).toBeVisible();
  const line = chart.locator('.recharts-line-curve');
  await expect(line).toBeAttached();
  const path = await line.getAttribute('d');
  expect(path).not.toMatch(/NaN|Infinity/);
  expect(path!.match(/[ML]/g)).toHaveLength(17);
  const indicator = receipts.locator('[data-slot=metric-trend] > span');
  const style = await indicator.evaluate((element) => {
    const css = getComputedStyle(element);
    return { border: css.borderTopWidth, background: css.backgroundColor };
  });
  expect(style).toEqual({ border: '0px', background: 'rgba(0, 0, 0, 0)' });
  const chartBounds = (await chart.boundingBox())!;
  const indicatorBounds = (await indicator.boundingBox())!;
  expect(indicatorBounds.x).toBeGreaterThanOrEqual(chartBounds.x + chartBounds.width);
  expect(
    Math.abs(indicatorBounds.y + indicatorBounds.height - chartBounds.y - chartBounds.height)
  ).toBeLessThan(2);
  await expect(page.getByText(/^Порівняння:/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await expect(line).not.toHaveAttribute('stroke-dasharray', /.+/);
  for (const trend of await page.locator('[data-slot=metric-trend]').all()) {
    await expect(trend.getByRole('img')).toBeVisible();
    const header = trend.locator('..');
    const title = (await header.locator('[data-slot=card-title]').boundingBox())!;
    const bounds = (await trend.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(title.y + title.height - 3);
  }
  await page.screenshot({
    path: info.outputPath('overview-trends.png'),
    fullPage: true,
    animations: 'disabled'
  });
  await page.evaluate(() => document.fonts.ready);
  const cards = page.locator('[data-slot=summary-card-link] [data-slot=card]');
  const compact = await cards.evaluateAll((elements) =>
    elements.map((element) => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height
    }))
  );
  // Compare with the original action icon and no chart: neither trend element may add height.
  await cards.evaluateAll((elements) =>
    elements.forEach((element) => {
      element.querySelector('[data-slot=metric-trend]')!.remove();
      const action = element.querySelector('[data-slot=card-action]')!;
      const icon = document.createElement('span');
      Object.assign(icon.style, { display: 'block', width: '20px', height: '20px' });
      action.replaceChildren(icon);
    })
  );
  const original = await cards.evaluateAll((elements) =>
    elements.map((element) => ({
      width: element.getBoundingClientRect().width,
      height: element.getBoundingClientRect().height
    }))
  );
  expect(compact).toEqual(original);
  expect(errors).toEqual([]);
});

test('empty month and first-day charts stay finite and display a zero comparison', async ({
  page
}) => {
  await page.clock.setFixedTime(new Date('2027-01-01T10:00:00Z'));
  await page.goto('/dashboard/overview?empty');
  const trends = page.locator('[data-slot=metric-trend]');
  await expect(trends).toHaveCount(7);
  for (let index = 0; index < 7; index++) {
    await expect(trends.nth(index)).toContainText('0%');

    await expect(trends.nth(index).locator('svg circle')).toHaveCount(1);
  }
});

test('Recharts draws each line from left to right and respects reduced motion', async ({
  page
}) => {
  await page.clock.setFixedTime(new Date('2026-11-17T10:00:00Z'));
  await page.addInitScript(() => {
    const samples: string[] = [];
    Object.assign(window, { trendAnimationSamples: samples });
    new MutationObserver((records) => {
      for (const record of records) {
        const element = record.target;
        if (
          element instanceof SVGElement &&
          element.matches('[data-slot=metric-trend] .recharts-line-curve')
        ) {
          const dash = element.getAttribute('stroke-dasharray');
          if (dash) samples.push(dash);
        }
      }
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ['stroke-dasharray']
    });
  });
  await page.goto('/dashboard/overview?trendDemo');
  const line = page.locator('[data-slot=metric-trend] .recharts-line-curve').first();
  await expect(line).toBeAttached();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as unknown as { trendAnimationSamples: string[] }).trendAnimationSamples.some(
          (dash) => {
            const values = dash.match(/[\d.]+/g)?.map(Number) ?? [];
            return values.length === 2 && values[0] > 0 && values[0] < values[1];
          }
        )
      )
    )
    .toBe(true);
  await expect(line).not.toHaveAttribute('stroke-dasharray', /.+/);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(line).toBeAttached();
  await expect(line).not.toHaveAttribute('stroke-dasharray', /.+/);
  expect(
    await page.evaluate(
      () => (window as unknown as { trendAnimationSamples: string[] }).trendAnimationSamples
    )
  ).toEqual([]);
});
