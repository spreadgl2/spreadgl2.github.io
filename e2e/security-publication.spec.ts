import { expect, test } from '@playwright/test';
import { confirmImportSettings } from './helpers';

test('landing screen does not prefetch CARTO and map requests begin only after loading', async ({
  page,
}) => {
  const cartoRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('basemaps.cartocdn.com')) cartoRequests.push(request.url());
  });

  await page.goto('/');
  await page.waitForTimeout(500);
  expect(cartoRequests).toHaveLength(0);

  await page.getByTestId('example-pedv').click();
  await confirmImportSettings(page, 30_000);
  await page.getByTestId('btn-play').waitFor({ state: 'visible', timeout: 90_000 });
  await expect.poll(() => cartoRequests.length, { timeout: 30_000 }).toBeGreaterThan(0);
});

test('production CSP blocks dynamically injected inline scripts', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const violations: string[] = [];
    document.addEventListener('securitypolicyviolation', (event) => violations.push(event.blockedURI));
    const script = document.createElement('script');
    script.textContent = 'window.__spreadgl2Injected = true';
    document.head.append(script);
    await new Promise((resolve) => setTimeout(resolve, 50));
    return {
      injected: '__spreadgl2Injected' in window,
      violations,
    };
  });

  expect(result.injected).toBe(false);
  expect(result.violations).toContain('inline');
});
