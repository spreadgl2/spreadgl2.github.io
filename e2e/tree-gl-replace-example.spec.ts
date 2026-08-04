import { expect, test } from '@playwright/test';
import { confirmImportSettings } from './helpers';

const PARSE_TIMEOUT_MS = 90_000;

type DeckLayerInfo = {
  activeArcCount: number;
  activeTripCount: number;
  branchCount: number;
  layerIds: string[];
};

async function loadExample(page: import('@playwright/test').Page, id: string) {
  await page.locator(`[data-testid="example-${id}"]`).click();
  await confirmImportSettings(page, PARSE_TIMEOUT_MS);
  await expect(page.locator('[data-testid="btn-play"]')).toBeEnabled({
    timeout: PARSE_TIMEOUT_MS,
  });
}

async function dropTree(page: import('@playwright/test').Page, fixturePath: string, filename: string) {
  const dropZone = page.locator('[data-testid="drop-zone"]');
  await dropZone.waitFor({ state: 'visible' });
  const replacementModal = page.locator('[data-testid="replace-file-modal"]');
  const replacing = await replacementModal.isVisible();

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
  await confirmImportSettings(page, PARSE_TIMEOUT_MS);
  if (replacing) await expect(replacementModal).toBeHidden({ timeout: PARSE_TIMEOUT_MS });
  await expect(page.locator('[data-testid="btn-play"]')).toBeEnabled({
    timeout: PARSE_TIMEOUT_MS,
  });
}

async function readDeckLayerInfo(page: import('@playwright/test').Page) {
  return page.evaluate(
    () => (window as Record<string, unknown>).__deckLayerInfo as DeckLayerInfo | undefined,
  );
}

async function expectUnifiedDeckCanvasSized(page: import('@playwright/test').Page) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const canvas = Array.from(document.querySelectorAll('canvas')).find(
            (c) => !c.classList.contains('maplibregl-canvas'),
          );
          if (!canvas) return false;
          const rect = canvas.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          return canvas.width >= rect.width * dpr * 0.8 && canvas.height >= rect.height * dpr * 0.8;
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
}

async function sampleTreePixels(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const treePanel = document.querySelector('[data-testid="tree-panel"]');
    if (!treePanel) throw new Error('tree panel not found');
    const treeRect = treePanel.getBoundingClientRect();
    const canvases = Array.from(document.querySelectorAll('canvas')) as HTMLCanvasElement[];
    const overlay = canvases.find((canvas) => {
      if (canvas.classList.contains('maplibregl-canvas')) return false;
      const rect = canvas.getBoundingClientRect();
      return (
        rect.left < treeRect.right &&
        rect.right > treeRect.left &&
        rect.top < treeRect.bottom &&
        rect.bottom > treeRect.top
      );
    });
    if (!overlay) return { coloredPixels: 0, width: 0, height: 0 };
    const gl =
      overlay.getContext('webgl2', { preserveDrawingBuffer: true }) ??
      overlay.getContext('webgl', { preserveDrawingBuffer: true });
    if (!gl) return { coloredPixels: 0, width: 0, height: 0 };
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const canvasRect = overlay.getBoundingClientRect();
    const scaleX = width / canvasRect.width;
    const scaleY = height / canvasRect.height;
    const sampleX = Math.max(0, Math.floor((treeRect.left - canvasRect.left) * scaleX));
    const sampleY = Math.max(0, Math.floor((canvasRect.bottom - treeRect.bottom) * scaleY));
    const sampleWidth = Math.min(width - sampleX, Math.max(1, Math.floor(treeRect.width * scaleX)));
    const sampleHeight = Math.min(
      height - sampleY,
      Math.max(1, Math.floor(treeRect.height * scaleY)),
    );
    const pixels = new Uint8Array(sampleWidth * sampleHeight * 4);
    gl.readPixels(
      sampleX,
      sampleY,
      sampleWidth,
      sampleHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
    let coloredPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] ?? 0;
      const g = pixels[i + 1] ?? 0;
      const b = pixels[i + 2] ?? 0;
      const a = pixels[i + 3] ?? 0;
      if (a > 0 && (r > 8 || g > 8 || b > 8)) coloredPixels++;
    }
    return { coloredPixels, width: sampleWidth, height: sampleHeight };
  });
}

test.describe('tree-gl replace file', () => {
  test('uploaded continuous replacement renders tree and animated branches without refresh', async ({
    page,
  }) => {
    await page.goto('/?dev=tree-gl');

    await loadExample(page, 'pedv');
    await page.locator('[data-testid="sidebar-replace-btn"]').click();
    await expect(page.locator('[data-testid="replace-file-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="tree-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="drop-zone"]')).toBeVisible();

    await dropTree(page, '/examples/yfv/tree.nex', 'tree.nex');
    await expectUnifiedDeckCanvasSized(page);
    await page.keyboard.press('End');

    await expect
      .poll(async () => {
        const info = await readDeckLayerInfo(page);
        return info?.branchCount ?? 0;
      }, { timeout: PARSE_TIMEOUT_MS })
      .toBeGreaterThan(0);

    const info = await readDeckLayerInfo(page);
    expect(info).toBeDefined();
    expect(info!.layerIds).not.toContain('boundaries-pedv');
    expect(info!.layerIds.some((id) => id.startsWith('branches-'))).toBe(true);
    expect(info!.activeArcCount + info!.activeTripCount).toBeGreaterThan(0);

    await expect
      .poll(async () => (await sampleTreePixels(page)).coloredPixels, { timeout: 15_000 })
      .toBeGreaterThan(0);
  });

  test('uploaded discrete replacement renders tree and animated branches without refresh', async ({
    page,
  }) => {
    await page.goto('/?dev=tree-gl');

    await loadExample(page, 'yfv');
    await page.locator('[data-testid="sidebar-replace-btn"]').click();
    await expect(page.locator('[data-testid="drop-zone"]')).toBeVisible();

    await dropTree(page, '/examples/pedv/tree.nex', 'tree.nex');
    await expectUnifiedDeckCanvasSized(page);
    await page.keyboard.press('End');

    await expect
      .poll(async () => {
        const info = await readDeckLayerInfo(page);
        return info?.branchCount ?? 0;
      }, { timeout: PARSE_TIMEOUT_MS })
      .toBeGreaterThan(0);

    const info = await readDeckLayerInfo(page);
    expect(info).toBeDefined();
    expect(info!.layerIds).not.toContain('boundaries-yfv');
    expect(info!.layerIds.some((id) => id.startsWith('branches-'))).toBe(true);
    expect(info!.activeArcCount + info!.activeTripCount).toBeGreaterThan(0);

    await expect
      .poll(async () => (await sampleTreePixels(page)).coloredPixels, { timeout: 15_000 })
      .toBeGreaterThan(0);
  });

  test('second dropped tree renders tree and animated branches without refresh', async ({ page }) => {
    await page.goto('/?dev=tree-gl');

    await dropTree(page, '/examples/pedv/tree.nex', 'tree.nex');
    await page.locator('[data-testid="sidebar-replace-btn"]').click();
    await expect(page.locator('[data-testid="drop-zone"]')).toBeVisible();

    await dropTree(page, '/examples/yfv/tree.nex', 'tree.nex');
    await expectUnifiedDeckCanvasSized(page);
    await page.keyboard.press('End');

    await expect
      .poll(async () => {
        const info = await readDeckLayerInfo(page);
        return info?.branchCount ?? 0;
      }, { timeout: PARSE_TIMEOUT_MS })
      .toBeGreaterThan(0);

    const info = await readDeckLayerInfo(page);
    expect(info).toBeDefined();
    expect(info!.layerIds.some((id) => id.startsWith('branches-'))).toBe(true);
    expect(info!.activeArcCount + info!.activeTripCount).toBeGreaterThan(0);

    await expect
      .poll(async () => (await sampleTreePixels(page)).coloredPixels, { timeout: 15_000 })
      .toBeGreaterThan(0);
  });

  test('second file-picker tree renders tree and animated branches without refresh', async ({
    page,
  }) => {
    await page.goto('/?dev=tree-gl');

    await loadExample(page, 'pedv');
    await page.locator('[data-testid="sidebar-replace-btn"]').click();
    await expect(page.locator('[data-testid="drop-zone"]')).toBeVisible();

    const chooserPromise = page.waitForEvent('filechooser');
    await page.locator('[data-testid="loader-open-btn"]').click();
    const chooser = await chooserPromise;
    await chooser.setFiles('public/examples/yfv/tree.nex');
    await confirmImportSettings(page, PARSE_TIMEOUT_MS);
    await expect(page.locator('[data-testid="btn-play"]')).toBeEnabled({
      timeout: PARSE_TIMEOUT_MS,
    });
    await expectUnifiedDeckCanvasSized(page);
    await page.keyboard.press('End');

    await expect
      .poll(async () => {
        const info = await readDeckLayerInfo(page);
        return info?.branchCount ?? 0;
      }, { timeout: PARSE_TIMEOUT_MS })
      .toBeGreaterThan(0);

    const info = await readDeckLayerInfo(page);
    expect(info).toBeDefined();
    expect(info!.layerIds.some((id) => id.startsWith('branches-'))).toBe(true);
    expect(info!.activeArcCount + info!.activeTripCount).toBeGreaterThan(0);

    await expect
      .poll(async () => (await sampleTreePixels(page)).coloredPixels, { timeout: 15_000 })
      .toBeGreaterThan(0);
  });

  test('replacing while playback is active does not corrupt the second render', async ({ page }) => {
    await page.goto('/?dev=tree-gl');

    await loadExample(page, 'yfv');
    await page.locator('[data-testid="btn-play"]').click();
    await expect(page.locator('[data-testid="btn-play"]')).toHaveAttribute('aria-label', 'Pause');
    await page.waitForTimeout(500);
    await page.locator('[data-testid="sidebar-replace-btn"]').click();
    await expect(page.locator('[data-testid="drop-zone"]')).toBeVisible();

    await dropTree(page, '/examples/pedv/tree.nex', 'tree.nex');
    await expectUnifiedDeckCanvasSized(page);
    await page.keyboard.press('End');

    await expect
      .poll(async () => {
        const info = await readDeckLayerInfo(page);
        return info?.branchCount ?? 0;
      }, { timeout: PARSE_TIMEOUT_MS })
      .toBeGreaterThan(0);

    const info = await readDeckLayerInfo(page);
    expect(info).toBeDefined();
    expect(info!.layerIds).not.toContain('boundaries-yfv');
    expect(info!.layerIds.some((id) => id.startsWith('branches-'))).toBe(true);
    expect(info!.activeArcCount + info!.activeTripCount).toBeGreaterThan(0);

    await expect
      .poll(async () => (await sampleTreePixels(page)).coloredPixels, { timeout: 15_000 })
      .toBeGreaterThan(0);
  });

  test('replacing after B117 does not leave stale large-layer state', async ({ page }) => {
    await page.goto('/?dev=tree-gl');

    await loadExample(page, 'b117');
    await page.locator('[data-testid="sidebar-replace-btn"]').click();
    await expect(page.locator('[data-testid="drop-zone"]')).toBeVisible();

    await dropTree(page, '/examples/pedv/tree.nex', 'tree.nex');
    await expectUnifiedDeckCanvasSized(page);
    await page.keyboard.press('End');

    await expect
      .poll(async () => {
        const info = await readDeckLayerInfo(page);
        return info?.branchCount ?? 0;
      }, { timeout: PARSE_TIMEOUT_MS })
      .toBeGreaterThan(0);

    const info = await readDeckLayerInfo(page);
    expect(info).toBeDefined();
    expect(info!.layerIds).not.toContain('boundaries-b117');
    expect(info!.layerIds.some((id) => id.startsWith('branches-'))).toBe(true);
    expect(info!.activeArcCount + info!.activeTripCount).toBeGreaterThan(0);

    await expect
      .poll(async () => (await sampleTreePixels(page)).coloredPixels, { timeout: 15_000 })
      .toBeGreaterThan(0);
  });
});
