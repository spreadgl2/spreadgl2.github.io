import { test, expect } from '@playwright/test';
import { confirmImportSettings } from './helpers';

const LATENCY_BUDGET_MS = 8000;
const PLAYBACK_WAIT_MS = 5000;

const MIN_ACTIVE_BRANCHES_PEDV = 30;

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

  await confirmImportSettings(page, LATENCY_BUDGET_MS + 2000);
}

async function waitForPlayButton(page: import('@playwright/test').Page) {
  const playBtn = page.locator('[data-testid="btn-play"]');
  await playBtn.waitFor({ state: 'visible', timeout: LATENCY_BUDGET_MS + 2000 });
  await expect(playBtn).toBeEnabled({ timeout: LATENCY_BUDGET_MS });
}

test.describe('PEDV smoke (v0.2 gate)', () => {
  test('(a) drop PEDV → Trail animation runs + ≥30 active branches mid-playback', async ({ page }) => {
    await page.goto('/');

    await dropTree(page, '/examples/pedv/tree.nex', 'tree.nex');
    await waitForPlayButton(page);

    await page.keyboard.press('End');
    await page.waitForTimeout(500);

    const info = await page.evaluate(
      () => (window as Record<string, unknown>).__deckLayerInfo as { branchCount: number; activeCount: number } | undefined,
    );

    expect(info, '__deckLayerInfo not set on window').toBeDefined();
    expect(
      info!.activeCount,
      `only ${info!.activeCount} branches active at end; expected ≥${MIN_ACTIVE_BRANCHES_PEDV}`,
    ).toBeGreaterThanOrEqual(MIN_ACTIVE_BRANCHES_PEDV);

    const trailPill = page.locator('[data-testid="mode-pill-trail"]');
    await expect(trailPill).toHaveAttribute('aria-pressed', 'true');
  });

  test('(b) PEDV Space advances playhead', async ({ page }) => {
    await page.goto('/');

    await dropTree(page, '/examples/pedv/tree.nex', 'tree.nex');
    await waitForPlayButton(page);

    const readoutBefore = await page.locator('[data-testid="playhead-readout"]').textContent();

    await page.keyboard.press('Space');
    await page.waitForTimeout(PLAYBACK_WAIT_MS);

    const readoutAfter = await page.locator('[data-testid="playhead-readout"]').textContent();

    expect(readoutAfter, 'playhead readout must change during playback').not.toBe(readoutBefore);
  });

  test('(c) PEDV mode toggles 1/2/3/4 — no crash, mode pill changes', async ({ page }) => {
    await page.goto('/');

    await dropTree(page, '/examples/pedv/tree.nex', 'tree.nex');
    await waitForPlayButton(page);

    const modePills: Array<[string, string]> = [
      ['2', 'window'],
      ['1', 'trail'],
    ];

    for (const [key, pillId] of modePills) {
      await page.keyboard.press(key);
      await page.waitForTimeout(200);
      await expect(
        page.locator(`[data-testid="mode-pill-${pillId}"]`),
        `mode pill "${pillId}" should be active after pressing ${key}`,
      ).toHaveAttribute('aria-pressed', 'true');
    }

    await page.keyboard.press('4');
    await page.waitForTimeout(200);
    await expect(page.locator('[data-testid="toggle-clade"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.keyboard.press('3');
    await page.waitForTimeout(200);
    await expect(page.locator('[data-testid="toggle-arcs"]')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
