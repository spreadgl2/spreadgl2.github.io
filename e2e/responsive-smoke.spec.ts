import { expect, test } from '@playwright/test';
import { confirmImportSettings } from './helpers';

const VIEWPORTS = [
  { name: '1280×800 (full desktop)', width: 1280, height: 800 },
  { name: '1024×768 (compact desktop)', width: 1024, height: 768 },
  { name: '800×600 (sidebar rail)', width: 800, height: 600 },
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

      const sidebar = page.locator('[data-testid="sidebar"]');
      await expect(sidebar).toBeVisible();
      const sidebarBox = await sidebar.boundingBox();
      expect(sidebarBox, 'sidebar bounding box should exist').toBeTruthy();

      if (vp.width < 960) {
        expect(sidebarBox!.width, `sidebar at ${vp.width}px should be a rail`).toBeLessThanOrEqual(52);
        expect(
          await sidebar.evaluate((element) => element.scrollWidth <= element.clientWidth),
        ).toBe(true);
      } else if (vp.width < 1280) {
        expect(sidebarBox!.width, `sidebar at ${vp.width}px should stay expanded`).toBeGreaterThanOrEqual(
          175,
        );
        expect(sidebarBox!.width).toBeLessThanOrEqual(225);
      } else {
        expect(sidebarBox!.width, 'sidebar at full desktop should stay expanded').toBeGreaterThanOrEqual(
          215,
        );
        expect(sidebarBox!.width).toBeLessThanOrEqual(265);
      }

      const treeLabel = page.locator('[data-testid="header-toggle-tree"] span');
      if (vp.width <= 1150) {
        await expect(treeLabel).toBeHidden();
      } else {
        await expect(treeLabel).toBeVisible();
      }

      const exportLabel = page.locator('[data-testid="header-btn-export"] span');
      if (vp.width <= 900) {
        await expect(exportLabel).toBeHidden();
      } else {
        await expect(exportLabel).toBeVisible();
      }

      await page.locator('[data-testid="header-btn-settings"]').click();
      const drawer = page.locator('[data-testid="drawer"]');
      await expect(drawer).toBeVisible();
      const drawerBox = await drawer.boundingBox();
      expect(drawerBox, 'drawer bounding box should exist').toBeTruthy();
      expect(drawerBox!.width).toBeGreaterThanOrEqual(275);
      expect(drawerBox!.width).toBeLessThanOrEqual(365);
      expect(drawerBox!.width).toBeLessThanOrEqual(vp.width - sidebarBox!.width);
    });
  }
});
