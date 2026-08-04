import { expect, test } from '@playwright/test';
import { confirmImportSettings } from './helpers';

const PARSE_TIMEOUT_MS = 60_000;

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

  await confirmImportSettings(page, PARSE_TIMEOUT_MS);
}

type DeckLayerInfo = {
  activeCount: number;
  activeArcCount: number;
  layerIds: string[];
};

type PixelSample = {
  coloredPixels: number;
  width: number;
  height: number;
};

async function sampleMapOverlayPixels(
  page: import('@playwright/test').Page,
): Promise<PixelSample> {
  return page.evaluate(() => {
    const mapPanel = document.querySelector('[data-testid="map-panel"]');
    if (!mapPanel) throw new Error('map panel not found');
    const mapRect = mapPanel.getBoundingClientRect();
    const canvases = Array.from(document.querySelectorAll('canvas')) as HTMLCanvasElement[];
    const overlay = canvases.find((canvas) => {
      if (canvas.classList.contains('maplibregl-canvas')) return false;
      const rect = canvas.getBoundingClientRect();
      return (
        rect.left < mapRect.right &&
        rect.right > mapRect.left &&
        rect.top < mapRect.bottom &&
        rect.bottom > mapRect.top
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
    const sampleX = Math.max(0, Math.floor((mapRect.left - canvasRect.left) * scaleX));
    const sampleY = Math.max(0, Math.floor((canvasRect.bottom - mapRect.bottom) * scaleY));
    const sampleWidth = Math.min(width - sampleX, Math.max(1, Math.floor(mapRect.width * scaleX)));
    const sampleHeight = Math.min(
      height - sampleY,
      Math.max(1, Math.floor(mapRect.height * scaleY)),
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

async function deckOverlayCanvasCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('canvas')).filter(
      (canvas) => !(canvas as HTMLCanvasElement).classList.contains('maplibregl-canvas'),
    ).length;
  });
}

test.describe('tree-gl arc rendering', () => {
  test('arcs render visible pixels at End before any Arcs toggle', async ({ page }) => {
    await page.goto('/?dev=tree-gl');

    await dropTree(page, '/examples/yfv/tree.nex', 'tree.nex');
    await expect(page.locator('[data-testid="btn-play"]')).toBeEnabled({
      timeout: PARSE_TIMEOUT_MS,
    });

    await page.keyboard.press('End');
    await page.waitForFunction(
      () => {
        const info = (window as Record<string, unknown>).__deckLayerInfo as
          | DeckLayerInfo
          | undefined;
        return (
          info !== undefined &&
          info.layerIds.includes('branches-slice') &&
          info.activeArcCount > 0 &&
          info.activeCount > 0
        );
      },
      { timeout: PARSE_TIMEOUT_MS },
    );

    const info = await page.evaluate(
      () => (window as Record<string, unknown>).__deckLayerInfo as DeckLayerInfo | undefined,
    );
    expect(info).toBeDefined();
    expect(info!.layerIds).toContain('branches-slice');
    expect(info!.activeArcCount).toBeGreaterThan(0);
    expect(info!.activeCount).toBeGreaterThan(0);

    await expect
      .poll(async () => (await sampleMapOverlayPixels(page)).coloredPixels, { timeout: 15_000 })
      .toBeGreaterThan(0);

    const sample = await sampleMapOverlayPixels(page);
    expect(sample.width).toBeGreaterThan(0);
    expect(sample.height).toBeGreaterThan(0);
    expect(sample.coloredPixels).toBeGreaterThan(0);
    await expect.poll(async () => deckOverlayCanvasCount(page), { timeout: 15_000 }).toBe(1);
  });
});
