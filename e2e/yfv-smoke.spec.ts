import { test, expect } from '@playwright/test';
import { confirmImportSettings } from './helpers';

const PARSE_TIMEOUT_MS = 60_000;
const RECORD_TIMEOUT_MS = 60_000;
const TOTAL_TIMEOUT_MS = PARSE_TIMEOUT_MS + RECORD_TIMEOUT_MS + 10_000;

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

async function waitForPlayButton(page: import('@playwright/test').Page) {
  const playBtn = page.locator('[data-testid="btn-play"]');
  await playBtn.waitFor({ state: 'visible', timeout: PARSE_TIMEOUT_MS + 2000 });
  await expect(playBtn).toBeEnabled({ timeout: PARSE_TIMEOUT_MS });
}

type DeckLayerInfo = {
  branchCount: number;
  activeCount: number;
  multiHpdPolygonCount: number;
  activeMultiHpdPolygonCount: number;
  layerIds: string[];
  colorByKey?: string;
  firstBranchColor?: [number, number, number, number] | null;
};

async function getDeckLayerInfo(page: import('@playwright/test').Page): Promise<DeckLayerInfo | undefined> {
  return page.evaluate(
    () => (window as Record<string, unknown>).__deckLayerInfo as DeckLayerInfo | undefined,
  );
}

test.describe('YFV smoke (v0.3 gate)', () => {
  test.setTimeout(TOTAL_TIMEOUT_MS);

  test('(a) HPD polygons are time-gated: more active multi-HPD polygons at End than at Start', async ({ page }) => {
    await page.goto('/');

    await dropTree(page, '/examples/yfv/tree.nex', 'tree.nex');
    await waitForPlayButton(page);

    await page.waitForFunction(
      () => (window as Record<string, unknown>).__deckLayerInfo !== undefined,
      { timeout: PARSE_TIMEOUT_MS },
    );
    const infoInit = await getDeckLayerInfo(page);
    expect(infoInit, '__deckLayerInfo not set on window — DEV mode may not be active').toBeDefined();
    expect(
      infoInit!.multiHpdPolygonCount,
      `expected multi-modal HPD polygon data > 0; got ${infoInit!.multiHpdPolygonCount}`,
    ).toBeGreaterThan(0);

    // The HPD polygon toggle moved from the Layers panel to the Style panel
    // (LayersPanel.test.tsx guards this: "no longer renders the map render
    // controls (moved to the Style panel)").
    await page.locator('[data-testid="header-btn-style"]').click();
    const stylePanel = page.locator('[data-testid="style-panel"]');
    await stylePanel.waitFor({ state: 'visible' });

    const hpdToggle = page.locator('[data-testid="layer-toggle-hpd-polygons"]');
    await expect(hpdToggle).toBeVisible();
    await hpdToggle.check();
    await hpdToggle.blur();

    await page.waitForTimeout(300);

    // At Start: playhead = dateRange[0] (a hair before TMRCA). In Trail mode,
    // filterRange upper = playhead. Root nodeTime = TMRCA > playhead, so
    // every HPD polygon must be GPU-filtered out. Count must be exactly 0.
    await page.keyboard.press('Home');
    await page.waitForTimeout(500);

    const infoAtStart = await getDeckLayerInfo(page);
    expect(infoAtStart, '__deckLayerInfo missing after Home key').toBeDefined();
    expect(
      infoAtStart!.activeMultiHpdPolygonCount,
      `expected 0 active multi-HPD polygons at t=0 (playhead = dateRange[0]); got ${infoAtStart!.activeMultiHpdPolygonCount} — root HPD polygon is leaking at t=0`,
    ).toBe(0);
    const countAtStart = infoAtStart!.activeMultiHpdPolygonCount;

    // At End: playhead = dateRange[1]; all nodes are active. activeMultiHpdPolygonCount = total.
    await page.keyboard.press('End');
    await page.waitForTimeout(500);

    const infoAtEnd = await getDeckLayerInfo(page);
    expect(infoAtEnd, '__deckLayerInfo missing after End key').toBeDefined();

    expect(
      infoAtEnd!.activeMultiHpdPolygonCount,
      `expected active multi-HPD polygon count at End (${infoAtEnd!.activeMultiHpdPolygonCount}) to be > 0`,
    ).toBeGreaterThan(0);

    expect(
      infoAtEnd!.activeMultiHpdPolygonCount,
      `expected active multi-HPD polygon count at End (${infoAtEnd!.activeMultiHpdPolygonCount}) to be strictly greater than at Start (${countAtStart}) — time-gating must be working`,
    ).toBeGreaterThan(countAtStart);

    expect(
      infoAtEnd!.layerIds,
      `expected hpd-polygons-multi in rendered layer IDs at End; got ${JSON.stringify(infoAtEnd!.layerIds)}`,
    ).toContain('hpd-polygons-multi');

    const trailPill = page.locator('[data-testid="mode-pill-trail"]');
    await expect(trailPill).toHaveAttribute('aria-pressed', 'true');
  });

  test('(b) Style panel color-by shows ecoregion and switching drives a real recolor', async ({ page }) => {
    await page.goto('/');

    await dropTree(page, '/examples/yfv/tree.nex', 'tree.nex');
    await waitForPlayButton(page);

    await page.waitForFunction(
      () => (window as Record<string, unknown>).__deckLayerInfo !== undefined,
      { timeout: PARSE_TIMEOUT_MS },
    );

    await page.locator('[data-testid="header-btn-style"]').click();
    const stylePanel = page.locator('[data-testid="style-panel"]');
    await stylePanel.waitFor({ state: 'visible' });

    const colorBySelect = page.locator('[data-testid="color-by-select"]');
    await expect(colorBySelect).toBeVisible();

    const ecoregionOption = colorBySelect.locator('option[value="ecoregion"]');
    const ecoregionExists = await ecoregionOption.count();
    expect(
      ecoregionExists,
      'ecoregion option must be present in color-by dropdown for YFV (continuous tree with secondary discrete traits)',
    ).toBeGreaterThan(0);

    // Capture the color signal before selecting ecoregion (default = __time__).
    const infoBefore = await getDeckLayerInfo(page);
    expect(infoBefore, '__deckLayerInfo missing before color-by switch').toBeDefined();
    expect(infoBefore!.colorByKey, 'baseline colorByKey should be __time__').toBe('__time__');
    const colorBefore = infoBefore!.firstBranchColor;

    await colorBySelect.selectOption('ecoregion');
    await expect(colorBySelect).toHaveValue('ecoregion');

    // Wait for the color to propagate through React state + deck.gl rerender.
    await page.waitForTimeout(300);

    const infoAfter = await getDeckLayerInfo(page);
    expect(infoAfter, '__deckLayerInfo missing after color-by switch').toBeDefined();
    expect(infoAfter!.colorByKey, 'colorByKey must update to ecoregion').toBe('ecoregion');
    const colorAfter = infoAfter!.firstBranchColor;

    expect(colorAfter, 'firstBranchColor must be defined after switching to ecoregion').toBeDefined();
    expect(
      colorAfter,
      `firstBranchColor must change when switching from __time__ to ecoregion; got ${JSON.stringify(colorBefore)} → ${JSON.stringify(colorAfter)}`,
    ).not.toEqual(colorBefore);
  });

  test('(c) Export panel records video and download is non-empty', async ({ page }) => {
    await page.goto('/');

    await dropTree(page, '/examples/yfv/tree.nex', 'tree.nex');
    await waitForPlayButton(page);

    await page.locator('[data-testid="header-btn-export"]').click();
    const exportPanel = page.locator('[data-testid="export-panel"]');
    await exportPanel.waitFor({ state: 'visible' });

    const recordBtn = page.locator('[data-testid="export-record-btn"]');
    await expect(recordBtn).toBeVisible();

    const isSupported = !(await page.locator('[data-testid="export-unsupported"]').isVisible());
    if (!isSupported) {
      test.skip();
      return;
    }

    const downloadPromise = page.waitForEvent('download', { timeout: RECORD_TIMEOUT_MS });

    await recordBtn.click();

    const download = await downloadPromise;
    const path = await download.path();
    expect(path, 'download path must be set').toBeTruthy();

    const { size } = await page.evaluate(async (filePath: string) => {
      const r = await fetch(`file://${filePath}`);
      const buf = await r.arrayBuffer();
      return { size: buf.byteLength };
    }, path!).catch(() => ({ size: -1 }));

    if (size === -1) {
      const stream = await download.createReadStream();
      let byteCount = 0;
      await new Promise<void>((resolve, reject) => {
        stream.on('data', (chunk: Buffer) => { byteCount += chunk.length; });
        stream.on('end', resolve);
        stream.on('error', reject);
      });
      expect(byteCount, 'recorded video file must be non-empty').toBeGreaterThan(0);
    } else {
      expect(size, 'recorded video file must be non-empty').toBeGreaterThan(0);
    }
  });
});
