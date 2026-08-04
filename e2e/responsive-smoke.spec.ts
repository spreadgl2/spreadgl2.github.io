import { expect, test } from '@playwright/test';
import { confirmImportSettings } from './helpers';

const VIEWPORTS = [
  { name: '1280×800 (full desktop)', width: 1280, height: 800 },
  { name: '1024×768 (narrow desktop — sidebar rail)', width: 1024, height: 768 },
  { name: '800×600 (below minimum — guard shown)', width: 800, height: 600 },
] as const;

test.describe('Responsive smoke', () => {
  for (const vp of VIEWPORTS) {
    test(`layout at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      if (vp.width < 768 || vp.height < 600) {
        const guard = page.locator('[data-testid="small-screen-guard"]');
        await expect(guard).toBeVisible({ timeout: 5000 });
        const continueBtn = page.locator('[data-testid="small-screen-continue"]');
        await expect(continueBtn).toBeVisible();
        return;
      }

      const dropZone = page.locator('[data-testid="drop-zone"]');
      await expect(dropZone).toBeVisible({ timeout: 10000 });

      const treeText = await page.evaluate(async () => {
        const r = await fetch('/examples/yfv/tree.nex');
        return r.text();
      });

      await page.evaluate((text) => {
        const zone = document.querySelector('[data-testid="drop-zone"]');
        if (!zone) throw new Error('drop zone not found');
        const file = new File([text], 'tree.nex', { type: 'text/plain' });
        const dt = new DataTransfer();
        dt.items.add(file);
        zone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
      }, treeText);

      await confirmImportSettings(page, 30_000);

      const playBtn = page.locator('[data-testid="btn-play"]');
      await expect(playBtn).toBeEnabled({ timeout: 10000 });

      if (vp.width >= 1024 && vp.width < 1280) {
        // At narrow desktop, sidebar should collapse to 48px rail
        const sidebar = page.locator('[data-testid="sidebar"]');
        await expect(sidebar).toBeVisible();
        const box = await sidebar.boundingBox();
        expect(box, 'sidebar bounding box should exist').toBeTruthy();
        // Rail is 48px wide; allow a few px tolerance for borders
        expect(box!.width, `sidebar width at ${vp.width}px should be ≤52px`).toBeLessThanOrEqual(52);
      } else if (vp.width >= 1280) {
        // Full desktop: sidebar should be 240px
        const sidebar = page.locator('[data-testid="sidebar"]');
        await expect(sidebar).toBeVisible();
        const box = await sidebar.boundingBox();
        expect(box, 'sidebar bounding box should exist').toBeTruthy();
        expect(box!.width, 'sidebar width at full desktop should be ≥230px').toBeGreaterThanOrEqual(230);
      }
    });
  }
});
