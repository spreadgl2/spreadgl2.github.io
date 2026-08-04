/**
 * Unified deck.gl animation-FPS stress measurement for B.1.1.7 (~17k tips).
 *
 * Run: pnpm exec playwright test e2e/b117-animation-fps.spec.ts
 */

import { expect, test } from '@playwright/test';
import { confirmImportSettings } from './helpers';

const PARSE_TIMEOUT_MS = 90_000;
const ANIM_MEASURE_MS = 6_000;
const TOTAL_TIMEOUT_MS = PARSE_TIMEOUT_MS + ANIM_MEASURE_MS + 15_000;
const TARGET_EFFECTIVE_FPS = 20;
const MAX_FRAME_TIME_P95_MS = 50;
const MAX_FRAME_TIME_P99_MS = 100;
const MAX_JS_HEAP_MB = 350;

interface AnimFpsResult {
  animEffectiveFps: number;
  animFrameTimeP50: number;
  animFrameTimeP95: number;
  animFrameTimeP99: number;
  animColdFrameTimeMax: number;
  animSampleCount: number;
  animFpsStatus: string;
}

type LayerModeCase = {
  label: string;
  mode: 'trail' | 'window';
  arcs: boolean;
  expectedLayerId: 'branches-trail' | 'branches-slice';
};

type DeckLayerInfo = {
  activeCount: number;
  activeArcCount: number;
  activeTripCount: number;
  layerIds: string[];
};

type PixelSample = {
  coloredPixels: number;
  width: number;
  height: number;
};

async function readJsHeapMb(page: import('@playwright/test').Page): Promise<number> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Performance.enable');
    const result = await session.send('Performance.getMetrics');
    const heap =
      result.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ??
      Number.POSITIVE_INFINITY;
    return Math.round((heap / 1024 / 1024) * 10) / 10;
  } finally {
    await session.detach();
  }
}

const CASES: LayerModeCase[] = [
  { label: 'Trail / TripsLayer', mode: 'trail', arcs: false, expectedLayerId: 'branches-trail' },
  { label: 'Trail / ArcLayer', mode: 'trail', arcs: true, expectedLayerId: 'branches-slice' },
  { label: 'Window / TripsLayer', mode: 'window', arcs: false, expectedLayerId: 'branches-trail' },
  { label: 'Window / ArcLayer', mode: 'window', arcs: true, expectedLayerId: 'branches-slice' },
];

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

test.describe('@perf B.1.1.7 unified deck.gl animation-fps stress', () => {
  test.setTimeout(TOTAL_TIMEOUT_MS);

  for (const c of CASES) {
    test(`${c.label} animation pass reports fps and visible branch pixels`, async ({ page }) => {
      await page.goto(`/?dev=b117-stress&animate=1&mode=${c.mode}&arcs=${c.arcs ? '1' : '0'}`);
      await confirmImportSettings(page, PARSE_TIMEOUT_MS);

      await page.waitForFunction(
        () => {
          const r = (window as Record<string, unknown>).__b117AnimFps as
            | AnimFpsResult
            | undefined;
          return r?.animFpsStatus === 'done';
        },
        undefined,
        { timeout: TOTAL_TIMEOUT_MS },
      );

      await page.waitForFunction(
        ({ expectedLayerId, arcs }) => {
          const info = (window as Record<string, unknown>).__deckLayerInfo as
            | DeckLayerInfo
            | undefined;
          if (!info?.layerIds.includes(expectedLayerId)) return false;
          return arcs ? info.activeArcCount > 0 : info.activeTripCount > 0;
        },
        { expectedLayerId: c.expectedLayerId, arcs: c.arcs },
        { timeout: 15_000 },
      );

      await expect
        .poll(async () => (await sampleMapOverlayPixels(page)).coloredPixels, { timeout: 15_000 })
        .toBeGreaterThan(0);

      const result = await page.evaluate(
        () => (window as Record<string, unknown>).__b117AnimFps as AnimFpsResult,
      );
      const info = await page.evaluate(
        () => (window as Record<string, unknown>).__deckLayerInfo as DeckLayerInfo,
      );
      const sample = await sampleMapOverlayPixels(page);
      const heapMb = await readJsHeapMb(page);

      expect(result.animSampleCount).toBeGreaterThan(50);
      expect(result.animEffectiveFps).toBeGreaterThanOrEqual(TARGET_EFFECTIVE_FPS);
      expect(result.animFrameTimeP50).toBeGreaterThan(0);
      expect(result.animFrameTimeP95).toBeLessThanOrEqual(MAX_FRAME_TIME_P95_MS);
      expect(result.animFrameTimeP99).toBeLessThanOrEqual(MAX_FRAME_TIME_P99_MS);
      expect(result.animFrameTimeP50).toBeLessThanOrEqual(result.animFrameTimeP95);
      expect(result.animFrameTimeP95).toBeLessThanOrEqual(result.animFrameTimeP99);
      expect(result.animColdFrameTimeMax).toBeGreaterThan(0);
      expect(heapMb).toBeLessThanOrEqual(MAX_JS_HEAP_MB);
      expect(info.layerIds).toContain(c.expectedLayerId);
      expect(sample.width).toBeGreaterThan(0);
      expect(sample.height).toBeGreaterThan(0);
      expect(sample.coloredPixels).toBeGreaterThan(0);

      console.log(
        `[b117-unified-anim:${c.mode}:${c.arcs ? 'arcs' : 'trips'}] effectiveFps=${result.animEffectiveFps} frameMs(p50/p95/p99)=${result.animFrameTimeP50}/${result.animFrameTimeP95}/${result.animFrameTimeP99} coldMaxMs=${result.animColdFrameTimeMax} heapMb=${heapMb} coloredPixels=${sample.coloredPixels}`,
      );
    });
  }

  test('animation-fps readout elements are visible', async ({ page }) => {
    await page.goto('/?dev=b117-stress&animate=1');
    await confirmImportSettings(page, PARSE_TIMEOUT_MS);

    await page.waitForFunction(
      () => {
        const r = (window as Record<string, unknown>).__b117AnimFps as
          | AnimFpsResult
          | undefined;
        return r?.animFpsStatus === 'done';
      },
      undefined,
      { timeout: TOTAL_TIMEOUT_MS },
    );

    await expect(page.locator('[data-testid="anim-effective-fps"]')).toBeVisible();
    await expect(page.locator('[data-testid="anim-frame-time-p95"]')).toBeVisible();
    await expect(page.locator('[data-testid="anim-frame-time-p99"]')).toBeVisible();
  });

  test('4x CPU and DPR 2 profile stays within constrained budgets and renders at 1x', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    try {
      await page.addInitScript(() => {
        localStorage.setItem('spreadgl2_prefs', JSON.stringify({ renderQuality: 'performance' }));
      });
      await session.send('Performance.enable');
      await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.goto('/?dev=b117-stress&animate=1&mode=trail&arcs=0');
      await confirmImportSettings(page, PARSE_TIMEOUT_MS);
      await page.waitForFunction(
        () => {
          const result = (window as Record<string, unknown>).__b117AnimFps as
            | AnimFpsResult
            | undefined;
          return result?.animFpsStatus === 'done';
        },
        undefined,
        { timeout: TOTAL_TIMEOUT_MS },
      );

      const result = await page.evaluate(
        () => (window as Record<string, unknown>).__b117AnimFps as AnimFpsResult,
      );
      const canvasScale = await page.evaluate(() => {
        const canvases = Array.from(document.querySelectorAll('canvas')) as HTMLCanvasElement[];
        const overlay = canvases.find((canvas) => !canvas.classList.contains('maplibregl-canvas'));
        if (!overlay) return null;
        const rect = overlay.getBoundingClientRect();
        return rect.width > 0 ? overlay.width / rect.width : null;
      });
      const metrics = await session.send('Performance.getMetrics');
      const heapBytes = metrics.metrics.find(
        (metric) => metric.name === 'JSHeapUsedSize',
      )?.value;
      const heapMb = (heapBytes ?? Number.POSITIVE_INFINITY) / 1024 / 1024;

      expect(await page.evaluate(() => window.devicePixelRatio)).toBe(2);
      expect(canvasScale).not.toBeNull();
      expect(canvasScale ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(1.1);
      expect(result.animEffectiveFps).toBeGreaterThanOrEqual(10);
      expect(result.animFrameTimeP95).toBeLessThanOrEqual(100);
      expect(result.animFrameTimeP99).toBeLessThanOrEqual(250);
      expect(heapMb).toBeLessThanOrEqual(MAX_JS_HEAP_MB);

      console.log(
        `[b117-constrained] effectiveFps=${result.animEffectiveFps} frameMs(p95/p99)=${result.animFrameTimeP95}/${result.animFrameTimeP99} coldMaxMs=${result.animColdFrameTimeMax} heapMb=${heapMb.toFixed(1)} dpr=2 canvasScale=${canvasScale}`,
      );
    } finally {
      await session.detach();
      await context.close();
    }
  });
});
