import { expect, test } from '@playwright/test';
import { confirmImportSettings } from './helpers';

async function dropTree(page: import('@playwright/test').Page, fixturePath: string, filename: string) {
  const dropZone = page.locator('[data-testid="drop-zone"]');
  await dropZone.waitFor({ state: 'visible' });

  const treeText = await page.evaluate(async (path: string) => {
    const r = await fetch(path);
    return r.text();
  }, fixturePath);

  await page.evaluate(
    ({ text, name }: { text: string; name: string }) => {
      const zone = document.querySelector('[data-testid="drop-zone"]');
      if (!zone) throw new Error('drop zone not found');
      const file = new File([text], name, { type: 'text/plain' });
      const dt = new DataTransfer();
      dt.items.add(file);
      zone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
    },
    { text: treeText, name: filename },
  );

  await confirmImportSettings(page, 60_000);
}

async function mapCanvasSignature(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('.maplibregl-canvas') as HTMLCanvasElement | null;
    if (!canvas) return { hash: 0, length: 0 };
    const dataUrl = canvas.toDataURL('image/png');
    let hash = 2166136261;
    for (let i = 0; i < dataUrl.length; i += 113) {
      hash ^= dataUrl.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return { hash: hash >>> 0, length: dataUrl.length };
  });
}

async function stableMapCanvasSignature(page: import('@playwright/test').Page) {
  let previous = await mapCanvasSignature(page);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(250);
    const next = await mapCanvasSignature(page);
    if (next.length > 1_000 && next.hash === previous.hash) return next;
    previous = next;
  }
  return previous;
}

test.describe('tree-gl map interaction', () => {
  test('paints the B.1.1.7 basemap after the large viewer settles', async ({ page }) => {
    await page.setViewportSize({ width: 1936, height: 1255 });
    await page.goto('/?dev=tree-gl');
    await dropTree(page, '/examples/b117/tree.nex', 'tree.nex');
    await expect(page.locator('[data-testid="btn-play"]')).toBeEnabled({ timeout: 60_000 });
    await page.locator('.maplibregl-canvas').waitFor({ state: 'visible', timeout: 60_000 });

    await page.waitForTimeout(6000);
    expect((await mapCanvasSignature(page)).length).toBeGreaterThan(50_000);
  });

  test('dragging the map moves the MapLibre basemap with DeckGL layers', async ({ page }) => {
    await page.goto('/?dev=tree-gl');
    await dropTree(page, '/examples/yfv/tree.nex', 'tree.nex');
    await expect(page.locator('[data-testid="btn-play"]')).toBeEnabled({ timeout: 30_000 });
    await page.locator('.maplibregl-canvas').waitFor({ state: 'visible' });

    const before = await stableMapCanvasSignature(page);
    expect(before.length).toBeGreaterThan(1_000);

    const box = await page.locator('[data-testid="map-panel"]').boundingBox();
    if (!box) throw new Error('map panel not found');
    const x = box.x + box.width * 0.55;
    const y = box.y + box.height * 0.5;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 180, y + 80, { steps: 12 });
    await page.mouse.up();

    await expect
      .poll(async () => mapCanvasSignature(page), { timeout: 5_000 })
      .not.toEqual(before);
  });
});
