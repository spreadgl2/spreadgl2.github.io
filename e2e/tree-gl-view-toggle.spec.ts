import { expect, test } from '@playwright/test';
import { confirmImportSettings } from './helpers';

const PARSE_TIMEOUT_MS = 90_000;

async function loadExample(page: import('@playwright/test').Page, id: string) {
  await page.locator(`[data-testid="example-${id}"]`).click();
  await confirmImportSettings(page, PARSE_TIMEOUT_MS);
  await expect(page.locator('[data-testid="btn-play"]')).toBeEnabled({
    timeout: PARSE_TIMEOUT_MS,
  });
}

async function sampleTreePixelExtent(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const treePanel = document.querySelector('[data-testid="tree-panel"]');
    if (!treePanel) return { coloredPixels: 0, width: 0, height: 0, xSpan: 0, ySpan: 0 };
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
    if (!overlay) return { coloredPixels: 0, width: 0, height: 0, xSpan: 0, ySpan: 0 };
    const gl =
      overlay.getContext('webgl2', { preserveDrawingBuffer: true }) ??
      overlay.getContext('webgl', { preserveDrawingBuffer: true });
    if (!gl) return { coloredPixels: 0, width: 0, height: 0, xSpan: 0, ySpan: 0 };

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
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let y = 0; y < sampleHeight; y++) {
      for (let x = 0; x < sampleWidth; x++) {
        const i = (y * sampleWidth + x) * 4;
        const r = pixels[i] ?? 0;
        const g = pixels[i + 1] ?? 0;
        const b = pixels[i + 2] ?? 0;
        const a = pixels[i + 3] ?? 0;
        if (a > 0 && (r > 8 || g > 8 || b > 8)) {
          coloredPixels++;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    return {
      coloredPixels,
      width: sampleWidth,
      height: sampleHeight,
      xSpan: Number.isFinite(minX) ? maxX - minX + 1 : 0,
      ySpan: Number.isFinite(minY) ? maxY - minY + 1 : 0,
    };
  });
}

test.describe('tree-gl view toggles', () => {
  test('tree view restores full-panel scaling after being hidden and shown again', async ({
    page,
  }) => {
    await page.goto('/');
    await loadExample(page, 'pedv');
    await expect(page.locator('[data-testid="tree-panel"]')).toBeVisible({
      timeout: PARSE_TIMEOUT_MS,
    });

    await expect
      .poll(async () => {
        const extent = await sampleTreePixelExtent(page);
        return extent.coloredPixels > 0 ? extent.xSpan / extent.width : 0;
      }, { timeout: 15_000 })
      .toBeGreaterThan(0.25);

    await page.locator('[data-testid="header-toggle-tree"]').click();
    await expect(page.locator('[data-testid="tree-panel"]')).toHaveCount(0);

    await page.locator('[data-testid="header-toggle-tree"]').click();
    await expect(page.locator('[data-testid="tree-panel"]')).toBeVisible();

    await expect
      .poll(async () => {
        const extent = await sampleTreePixelExtent(page);
        return extent.coloredPixels > 0 ? extent.xSpan / extent.width : 0;
      }, { timeout: 15_000 })
      .toBeGreaterThan(0.25);

    await expect
      .poll(async () => {
        const extent = await sampleTreePixelExtent(page);
        return extent.coloredPixels > 0 ? extent.ySpan / extent.height : 0;
      }, { timeout: 15_000 })
      .toBeGreaterThan(0.45);
  });
});
