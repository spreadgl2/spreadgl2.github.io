/**
 * Full-animation FPS measurement for B.1.1.7 through the real viewer route.
 *
 * This loads the full fixture through the real viewer route, runs one complete
 * Trail playback at displayed 1x (the previous 2x pace), and
 * reporting browser requestAnimationFrame FPS statistics.
 *
 * Run: pnpm exec playwright test e2e/b117-tree-gl-full-animation-fps.spec.ts
 *
 * Headless Chromium commonly uses software rendering. The test enforces the
 * current regression target while logging percentile stats for diagnosis.
 */

import { expect, test } from '@playwright/test';
import { confirmImportSettings } from './helpers';

const PARSE_TIMEOUT_MS = 90_000;
const FULL_PLAYBACK_TIMEOUT_MS = 45_000;
const TOTAL_TIMEOUT_MS = PARSE_TIMEOUT_MS + FULL_PLAYBACK_TIMEOUT_MS + 15_000;
const SAMPLER_WARMUP_MS = 500;
const TARGET_EFFECTIVE_FPS = 20;
const MAX_FRAME_TIME_P95_MS = 50;
const MAX_FRAME_TIME_P99_MS = 100;
const MIN_EXPECTED_PLAYBACK_MS = 7_500;

interface FullAnimationFpsResult {
  durationMs: number;
  effectiveFps: number;
  frameTimeP50: number;
  frameTimeP95: number;
  frameTimeP99: number;
  coldFrameTimeMax: number;
  frameCount: number;
  sampleCount: number;
  status: 'measuring' | 'done';
}

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

async function startFpsSampler(page: import('@playwright/test').Page) {
  await page.evaluate((samplerWarmupMs) => {
    const w = window as Window &
      typeof globalThis & {
        __b117ViewerAnimFps?: FullAnimationFpsResult;
        __stopB117ViewerAnimFps?: () => FullAnimationFpsResult;
      };

    let rafId = 0;
    let last = performance.now();
    const start = last;
    const deltas: number[] = [];

    w.__b117ViewerAnimFps = {
      durationMs: 0,
      effectiveFps: 0,
      frameTimeP50: 0,
      frameTimeP95: 0,
      frameTimeP99: 0,
      coldFrameTimeMax: 0,
      frameCount: 0,
      sampleCount: 0,
      status: 'measuring',
    };

    let coldFrameTimeMax = 0;

    const percentile = (sorted: number[], quantile: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))] ?? 0;

    const summarize = (status: 'measuring' | 'done'): FullAnimationFpsResult => {
      const now = performance.now();
      const sorted = [...deltas].sort((a, b) => a - b);
      const measuredDuration = Math.max(1, now - start - samplerWarmupMs);

      return {
        durationMs: Math.round((now - start) * 10) / 10,
        effectiveFps: Math.round(((sorted.length / measuredDuration) * 1000) * 10) / 10,
        frameTimeP50: Math.round(percentile(sorted, 0.5) * 10) / 10,
        frameTimeP95: Math.round(percentile(sorted, 0.95) * 10) / 10,
        frameTimeP99: Math.round(percentile(sorted, 0.99) * 10) / 10,
        coldFrameTimeMax: Math.round(coldFrameTimeMax * 10) / 10,
        frameCount: w.__b117ViewerAnimFps?.frameCount ?? 0,
        sampleCount: sorted.length,
        status,
      };
    };

    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      if (delta > 0 && Number.isFinite(delta)) coldFrameTimeMax = Math.max(coldFrameTimeMax, delta);
      if (now - start >= samplerWarmupMs && delta > 0 && Number.isFinite(delta)) {
        deltas.push(delta);
      }
      const previous = w.__b117ViewerAnimFps;
      w.__b117ViewerAnimFps = {
        ...(previous ?? summarize('measuring')),
        frameCount: (previous?.frameCount ?? 0) + 1,
      };
      rafId = requestAnimationFrame(tick);
    };

    w.__stopB117ViewerAnimFps = () => {
      if (rafId) cancelAnimationFrame(rafId);
      const result = summarize('done');
      w.__b117ViewerAnimFps = result;
      return result;
    };

    rafId = requestAnimationFrame(tick);
  }, SAMPLER_WARMUP_MS);
}

async function stopFpsSampler(
  page: import('@playwright/test').Page,
): Promise<FullAnimationFpsResult> {
  return page.evaluate(() => {
    const stop = (window as Window &
      typeof globalThis & {
        __stopB117ViewerAnimFps?: () => FullAnimationFpsResult;
      }).__stopB117ViewerAnimFps;
    if (!stop) throw new Error('B117 FPS sampler was not started');
    return stop();
  });
}

test.describe('@perf B.1.1.7 tree-gl full-animation FPS', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(TOTAL_TIMEOUT_MS);

  test('runs one full Trail animation and reports FPS stats', async ({ page }) => {
    await page.goto('/');
    await dropTree(page, '/examples/b117/tree.nex', 'tree.nex');

    const playButton = page.locator('[data-testid="btn-play"]');
    await expect(playButton).toBeEnabled({ timeout: PARSE_TIMEOUT_MS });

    await page.locator('[data-testid="speed-select"]').selectOption('1');
    await page.locator('[data-testid="btn-jump-start"]').click();

    await startFpsSampler(page);
    await playButton.click();

    await expect(playButton).toHaveAttribute('aria-label', 'Play', {
      timeout: FULL_PLAYBACK_TIMEOUT_MS,
    });

    const result = await stopFpsSampler(page);

    expect(result.status).toBe('done');
    expect(result.durationMs).toBeGreaterThan(MIN_EXPECTED_PLAYBACK_MS);
    expect(result.frameCount).toBeGreaterThan(0);
    expect(result.sampleCount).toBeGreaterThan(0);
    expect(result.effectiveFps).toBeGreaterThanOrEqual(TARGET_EFFECTIVE_FPS);
    expect(result.frameTimeP50).toBeGreaterThan(0);
    expect(result.frameTimeP95).toBeLessThanOrEqual(MAX_FRAME_TIME_P95_MS);
    expect(result.frameTimeP99).toBeLessThanOrEqual(MAX_FRAME_TIME_P99_MS);
    expect(result.frameTimeP50).toBeLessThanOrEqual(result.frameTimeP95);
    expect(result.frameTimeP95).toBeLessThanOrEqual(result.frameTimeP99);
    expect(result.coldFrameTimeMax).toBeGreaterThan(0);

    console.log(
      `[b117-tree-gl-full-anim] effectiveFps=${result.effectiveFps} frameMs(p50/p95/p99)=${result.frameTimeP50}/${result.frameTimeP95}/${result.frameTimeP99} coldMaxMs=${result.coldFrameTimeMax} frames=${result.frameCount} samples=${result.sampleCount} durationMs=${result.durationMs} (headless/swiftshader regression signal)`,
    );
  });
});
