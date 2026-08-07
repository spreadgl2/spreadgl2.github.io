import { expect, test } from '@playwright/test';

test.describe('Landing page', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test('presents the product, import actions, examples, and About resources on desktop', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 2048, height: 1185 });
    await page.goto('/');

    await expect(page.locator('[data-testid="landing-title"]')).toHaveText('SpreadGL2');
    await expect(page.locator('[data-testid="landing-title"]')).toHaveCSS('font-size', '70px');
    await expect(page.locator('[data-testid="landing-subtitle"]')).toHaveText(
      'High-performance interactive visualization for BEAST X phylogeographic analyses',
    );
    await expect(page.locator('[data-testid="drop-zone"]')).toContainText(
      'Drop a BEAST X tree or SpreadGL2 project here',
    );
    await expect(page.locator('[data-testid="example-b117"]')).toContainText(
      '17,716 tips · continuous · 2020–2021 · large dataset',
    );

    const details = await page.locator('[data-testid="landing-details"]').boundingBox();
    const action = await page.locator('[data-testid="landing-action"]').boundingBox();
    const shell = await page.locator('[data-testid="landing-page"] main').boundingBox();
    const title = await page.locator('[data-testid="landing-title"]').boundingBox();
    const subtitle = await page.locator('[data-testid="landing-subtitle"]').boundingBox();
    expect(details).toBeTruthy();
    expect(action).toBeTruthy();
    expect(shell).toBeTruthy();
    expect(title).toBeTruthy();
    expect(subtitle).toBeTruthy();
    expect(shell!.width).toBeGreaterThanOrEqual(1_350);
    expect(title!.y).toBeGreaterThanOrEqual(90);
    expect(title!.y).toBeLessThanOrEqual(105);
    expect(action!.y - (subtitle!.y + subtitle!.height)).toBeGreaterThanOrEqual(48);
    expect(details!.x).toBeLessThan(action!.x);
    expect(
      await page.locator('[data-testid="landing-page"]').evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    const verticalOverflow = await page
      .locator('[data-testid="landing-page"]')
      .evaluate((element) => element.scrollHeight - element.clientHeight);
    expect(verticalOverflow).toBeLessThanOrEqual(0);

    await expect(page.locator('[data-testid="landing-citation-btn"]')).toHaveCount(0);
    const aboutTrigger = page.locator('[data-testid="landing-about-btn"]');
    await aboutTrigger.click();
    await expect(page.locator('[data-testid="about-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="citation-text"]')).toContainText('Hong SL et al.');
    await expect(page.getByRole('link', { name: 'Samuel L. Hong' })).toHaveAttribute(
      'href',
      'https://orcid.org/0000-0001-6354-4943',
    );
    await page.locator('[data-testid="about-close-btn"]').click();
    await expect(aboutTrigger).toBeFocused();
  });

  test('stacks the import actions before details without horizontal overflow on mobile', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.locator('[data-testid="small-screen-continue"]').click();

    const action = await page.locator('[data-testid="landing-action"]').boundingBox();
    const details = await page.locator('[data-testid="landing-details"]').boundingBox();
    expect(action).toBeTruthy();
    expect(details).toBeTruthy();
    expect(action!.y).toBeLessThan(details!.y);
    expect(
      await page.locator('[data-testid="landing-page"]').evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    await expect(page.locator('[data-testid="drop-zone"]')).toBeVisible();
    await expect(page.locator('[data-testid="landing-title"]')).toHaveCSS('font-size', '44px');
    await expect(page.locator('[data-testid="landing-subtitle"]')).toHaveCSS('font-size', '18px');
  });

  test('uses compact typography and layout tiers without intermediate width jumps', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    const title = page.locator('[data-testid="landing-title"]');
    const subtitle = page.locator('[data-testid="landing-subtitle"]');
    await expect(title).toHaveCSS('font-size', '62px');
    await expect(subtitle).toHaveCSS('font-size', '22px');

    const wideDetails = await page.locator('[data-testid="landing-details"]').boundingBox();
    const wideAction = await page.locator('[data-testid="landing-action"]').boundingBox();
    expect(wideDetails).toBeTruthy();
    expect(wideAction).toBeTruthy();
    expect(wideDetails!.x).toBeLessThan(wideAction!.x);

    await page.setViewportSize({ width: 1024, height: 768 });
    await expect(title).toHaveCSS('font-size', '54px');
    await expect(subtitle).toHaveCSS('font-size', '20px');

    const compactDetails = await page.locator('[data-testid="landing-details"]').boundingBox();
    const compactAction = await page.locator('[data-testid="landing-action"]').boundingBox();
    expect(compactDetails).toBeTruthy();
    expect(compactAction).toBeTruthy();
    expect(compactAction!.y).toBeLessThan(compactDetails!.y);
  });

  test('fits without vertical scrolling on standard desktop viewports', async ({ page }) => {
    for (const viewport of [
      { width: 1600, height: 1000 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');

      const verticalOverflow = await page
        .locator('[data-testid="landing-page"]')
        .evaluate((element) => element.scrollHeight - element.clientHeight);
      expect(verticalOverflow).toBeLessThanOrEqual(0);
    }
  });
});
