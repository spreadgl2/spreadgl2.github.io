import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { confirmImportSettings } from './helpers';

const BSSVS_LOG = readFileSync(join(import.meta.dirname, '../tests/fixtures/bssvs-tiny.log'));

test('BEAST log is reviewed in the import modal before loading', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-testid="drop-zone"]').waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    const text = await (await fetch('/examples/yfv/tree.nex')).text();
    const zone = document.querySelector('[data-testid="drop-zone"]');
    if (!zone) throw new Error('drop zone not found');
    const dt = new DataTransfer();
    dt.items.add(new File([text], 'tree.nex', { type: 'text/plain' }));
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
  });
  await confirmImportSettings(page, 20_000);
  await expect(page.locator('[data-testid="btn-play"]')).toBeVisible({ timeout: 20_000 });

  await page.locator('[data-testid="sidebar-log-row"]').click();
  const dialog = page.getByRole('dialog', { name: 'Load BEAST log' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('[data-testid="log-open-file"]')).toBeFocused();

  await page.locator('[data-testid="log-file-input"]').setInputFiles({
    name: 'bssvs-tiny.log',
    mimeType: 'text/plain',
    buffer: BSSVS_LOG,
  });
  await expect(page.locator('[data-testid="log-summary-samples"]')).toHaveText('100');
  await expect(page.locator('[data-testid="log-import-burnin"]')).toHaveValue('10');
  await expect(page.locator('[data-testid="log-burnin-fraction"]')).toHaveText('(10/100 samples)');
  await page.locator('[data-testid="log-import-burnin"]').fill('25');
  await expect(page.locator('[data-testid="log-burnin-fraction"]')).toHaveText('(25/100 samples)');
  await expect(page.locator('[data-testid="log-import-notice"]')).toContainText(
    'this tree is continuous',
  );

  await page.locator('[data-testid="log-import-confirm"]').click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-testid="sidebar-log-row"]')).toContainText('bssvs-tiny.log');

  // Reopening shows the loaded log; burn-in can be re-applied, and the log removed.
  await page.locator('[data-testid="sidebar-log-row"]').click();
  const loadedDialog = page.getByRole('dialog', { name: 'BEAST log' });
  await expect(loadedDialog).toBeVisible();
  await expect(page.locator('[data-testid="log-import-burnin"]')).toHaveValue('25');
  await page.locator('[data-testid="log-import-burnin"]').fill('50');
  await page.locator('[data-testid="log-import-apply"]').click();
  await expect(loadedDialog).toBeHidden();

  await page.locator('[data-testid="sidebar-log-row"]').click();
  await expect(page.locator('[data-testid="log-burnin-fraction"]')).toHaveText('(50/100 samples)');
  await page.locator('[data-testid="log-import-remove"]').click();
  await expect(loadedDialog).toBeHidden();
  await expect(page.locator('[data-testid="sidebar-log-row"]')).toContainText('optional');
});
