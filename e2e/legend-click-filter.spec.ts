import { expect, test } from '@playwright/test';
import { confirmImportSettings } from './helpers';

const PARSE_TIMEOUT_MS = 60_000;
const TOTAL_TIMEOUT_MS = PARSE_TIMEOUT_MS + 20_000;

async function dropTree(
  page: import('@playwright/test').Page,
  fixturePath: string,
  filename: string,
) {
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
  layerIds: string[];
  colorByKey?: string;
  activeTripCount?: number;
  activeArcCount?: number;
};

async function getTreeDimmedCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(
    () => ((window as Record<string, unknown>).__treeDimmedCount as number | undefined) ?? 0,
  );
}

async function getDeckLayerInfo(
  page: import('@playwright/test').Page,
): Promise<DeckLayerInfo | undefined> {
  return page.evaluate(
    () => (window as Record<string, unknown>).__deckLayerInfo as DeckLayerInfo | undefined,
  );
}

test.describe('T082.5 Legend-click filter (PEDV)', () => {
  test.setTimeout(TOTAL_TIMEOUT_MS);

  test('deselecting a location dims tree branches and reduces active arc/trip count', async ({
    page,
  }) => {
    await page.goto('/');

    await dropTree(page, '/examples/pedv/tree.nex', 'tree.nex');
    await waitForPlayButton(page);

    await page.waitForFunction(
      () => (window as Record<string, unknown>).__deckLayerInfo !== undefined,
      { timeout: PARSE_TIMEOUT_MS },
    );

    await page.keyboard.press('End');
    await page.waitForTimeout(500);

    const infoAll = await getDeckLayerInfo(page);
    expect(infoAll, '__deckLayerInfo not set').toBeDefined();

    const tripCountAll = infoAll!.activeTripCount ?? infoAll!.activeCount;
    expect(tripCountAll, 'should have active trips/arcs before filter').toBeGreaterThan(0);

    const legendSection = page.locator('[data-testid="sidebar-legend"]');
    await expect(legendSection).toBeVisible();

    const legendRows = legendSection.locator('[data-testid^="legend-row-"]');
    const rowCount = await legendRows.count();
    expect(rowCount, 'legend must have at least one clickable row').toBeGreaterThan(0);

    const firstRow = legendRows.first();
    const firstValue = await firstRow.getAttribute('data-testid');
    expect(firstValue, 'first row must have data-testid').toBeTruthy();

    await firstRow.click();
    await page.waitForTimeout(300);

    const dimmedCount = await getTreeDimmedCount(page);
    expect(
      dimmedCount,
      `__treeDimmedCount must be > 0 after deselecting a location (got ${dimmedCount})`,
    ).toBeGreaterThan(0);

    const infoFiltered = await getDeckLayerInfo(page);
    expect(infoFiltered, '__deckLayerInfo missing after legend click').toBeDefined();

    const tripCountFiltered = infoFiltered!.activeTripCount ?? infoFiltered!.activeCount;
    expect(
      tripCountFiltered,
      `trip/arc count after deselecting one location (${tripCountFiltered}) must be less than all-selected count (${tripCountAll})`,
    ).toBeLessThan(tripCountAll);

    const showAll = page.locator('[data-testid="legend-show-all"]');
    await expect(showAll).toBeVisible();
    await showAll.click();
    await page.waitForTimeout(300);

    const infoReset = await getDeckLayerInfo(page);
    const tripCountReset = infoReset?.activeTripCount ?? infoReset?.activeCount ?? 0;
    expect(
      tripCountReset,
      `trip count after show-all (${tripCountReset}) must restore to ${tripCountAll}`,
    ).toBe(tripCountAll);
  });
});
