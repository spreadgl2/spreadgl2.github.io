import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { confirmImportSettings } from './helpers';

const DISCRETE_TREE = readFileSync(
  new URL('../tests/fixtures/discrete-tiny.nex', import.meta.url),
  'utf8',
);

const MISSING_INTERNAL_ANNOTATION_TREE = `#NEXUS
begin trees;
  tree T = [&R] ((A|2020-01-01[&region="Argentina"]:0.5,B|2020-06-01[&region="Uruguay"]:0.5):0.5,C|2021-01-01[&region="Argentina"]:1.0)[&region="Argentina"];
end;
`;

async function dropTree(page: Page, text: string, name = 'discrete-tiny.nex') {
  await page.evaluate(
    ({ fileName, treeText }) => {
      const zone = document.querySelector('[data-testid="drop-zone"]');
      if (!zone) throw new Error('Tree drop zone not found');
      const transfer = new DataTransfer();
      transfer.items.add(new File([treeText], fileName, { type: 'text/plain' }));
      zone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
    },
    { fileName: name, treeText: text },
  );
}

async function activeTestId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
}

test.describe('Publication usability guardrails', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test('Import Settings remains reachable and keyboard-contained at 768x600', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 600 });
    await page.goto('/');
    await page.locator('[data-testid="example-pedv"]').click();

    const dialog = page.locator('[data-testid="import-settings-modal"]');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => activeTestId(page)).toBe('import-settings-modal');

    const box = await dialog.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(600);

    const cancel = page.locator('[data-testid="import-settings-cancel"]');
    await cancel.scrollIntoViewIfNeeded();
    await cancel.focus();
    await page.keyboard.press('Tab');
    await expect.poll(() => activeTestId(page)).toBe('import-mrsd-override');
    await page.keyboard.press('Shift+Tab');
    await expect.poll(() => activeTestId(page)).toBe('import-settings-cancel');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect.poll(() => activeTestId(page)).toBe('example-pedv');
  });

  test('location lookup provides a keyboard-operable file chooser at 768x600', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 600 });
    await page.goto('/');
    await dropTree(page, DISCRETE_TREE);
    await confirmImportSettings(page, 30_000);

    const openFile = page.locator('[data-testid="csv-open-file"]');
    const skip = page.locator('[data-testid="csv-skip"]');
    await expect(openFile).toBeVisible({ timeout: 30_000 });
    await openFile.scrollIntoViewIfNeeded();
    await openFile.focus();
    await expect.poll(() => activeTestId(page)).toBe('csv-open-file');
    await skip.scrollIntoViewIfNeeded();
    await skip.focus();
    await expect.poll(() => activeTestId(page)).toBe('csv-skip');

    const chooserPromise = page.waitForEvent('filechooser');
    await openFile.click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
      name: 'locations.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('location,latitude,longitude\nNY,40.7,-74\nCA,36.7,-119.4\nTX,31,-99\n'),
    });

    const review = page.locator('[data-testid="csv-column-picker"]');
    await expect(review).toBeVisible();
    const continueButton = page.locator('[data-testid="csv-column-confirm"]');
    await continueButton.scrollIntoViewIfNeeded();
    await continueButton.focus();
    await expect.poll(() => activeTestId(page)).toBe('csv-column-confirm');
  });

  test('replacement and keyboard-help dialogs isolate and restore the viewer', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await page.locator('[data-testid="example-pedv"]').click();
    await confirmImportSettings(page, 30_000);
    await expect(page.locator('[data-testid="btn-play"]')).toBeEnabled({ timeout: 30_000 });

    const replaceTrigger = page.locator('[data-testid="sidebar-replace-btn"]');
    await replaceTrigger.click();
    await expect(page.locator('[data-testid="replace-file-modal"]')).toBeVisible();
    await expect.poll(() => activeTestId(page)).toBe('loader-open-btn');
    expect(
      await page.locator('[data-testid="btn-play"]').evaluate((element) =>
        Boolean(element.closest('[inert]')),
      ),
    ).toBe(true);

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="replace-file-modal"]')).toBeHidden();
    await expect.poll(() => activeTestId(page)).toBe('sidebar-replace-btn');

    await page.keyboard.press('?');
    const help = page.locator('[data-testid="keyboard-help-modal"]');
    await expect(help).toBeVisible();
    await expect.poll(() => activeTestId(page)).toBe('keyboard-help-close');
    expect(
      await page.locator('[data-testid="btn-play"]').evaluate((element) =>
        Boolean(element.closest('[inert]')),
      ),
    ).toBe(true);
    await page.locator('[data-testid="keyboard-help-links"] button').last().focus();
    await page.keyboard.press('Tab');
    await expect.poll(() => activeTestId(page)).toBe('keyboard-help-close');
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();
    await expect.poll(() => activeTestId(page)).toBe('sidebar-replace-btn');
  });

  test('small-screen dialog is named and receives focus', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 500 });
    await page.goto('/');
    const guard = page.locator('[data-testid="small-screen-guard"]');
    await expect(guard).toBeVisible();
    await expect(guard).toHaveAttribute('aria-labelledby', 'small-screen-guard-title');
    await expect.poll(() => activeTestId(page)).toBe('small-screen-continue');
  });

  test('short-wide import remains scrollable after the screen warning is dismissed', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 480 });
    await page.goto('/');
    await page.locator('[data-testid="small-screen-continue"]').click();
    await page.locator('[data-testid="example-pedv"]').click();

    const dialog = page.locator('[data-testid="import-settings-modal"]');
    const cancel = page.locator('[data-testid="import-settings-cancel"]');
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await cancel.scrollIntoViewIfNeeded();
    await cancel.focus();
    await expect.poll(() => activeTestId(page)).toBe('import-settings-cancel');

    const box = await dialog.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(480);
  });

  test('missing ancestral annotations require an explicit contained acknowledgement', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await dropTree(page, MISSING_INTERNAL_ANNOTATION_TREE, 'missing-internal-region.nex');
    await confirmImportSettings(page, 30_000);

    const warning = page.locator('[data-testid="location-annotation-warning"]');
    const continueButton = page.locator('[data-testid="location-annotation-warning-continue"]');
    await expect(warning).toBeVisible({ timeout: 30_000 });
    await expect(warning).toContainText('1 internal node has no region annotation');
    await expect.poll(() => activeTestId(page)).toBe('location-annotation-warning-continue');
    expect(
      await page.locator('[data-testid="btn-play"]').evaluate((element) =>
        Boolean(element.closest('[inert]')),
      ),
    ).toBe(true);

    await page.keyboard.press('Escape');
    await expect(warning).toBeVisible();
    await page.keyboard.press('Tab');
    await expect.poll(() => activeTestId(page)).toBe('location-annotation-warning-continue');
    await continueButton.click();
    await expect(warning).toBeHidden();
    await expect(page.locator('[data-testid="btn-play"]')).toBeEnabled();
  });
});
