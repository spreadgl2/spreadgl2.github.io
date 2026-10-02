import { expect, test } from '@playwright/test';
import { confirmImportSettings } from './helpers';

// Latitude-first boundary around Belo Horizonte. Both axes fit within ±90, so the
// order cannot be detected and the user has to choose it.
const LAT_FIRST_GEOJSON = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Belo Horizonte' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-19.8, -44.0],
            [-19.8, -43.8],
            [-20.0, -43.8],
            [-20.0, -44.0],
            [-19.8, -44.0],
          ],
        ],
      },
    },
  ],
});

test('uploaded GeoJSON asks for coordinate order before it is added', async ({ page }) => {
  await page.goto('/');
  const dropZone = page.locator('[data-testid="drop-zone"]');
  await dropZone.waitFor({ state: 'visible' });
  await page.evaluate(async () => {
    const text = await (await fetch('/examples/yfv/tree.nex')).text();
    const zone = document.querySelector('[data-testid="drop-zone"]');
    if (!zone) throw new Error('drop zone not found');
    const dt = new DataTransfer();
    dt.items.add(new File([text], 'tree.nex', { type: 'text/plain' }));
    zone.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt }));
  });
  await confirmImportSettings(page, 20_000);
  await expect(page.locator('[data-testid="btn-play"]')).toBeVisible({ timeout: 20_000 });

  await page.keyboard.press('l');
  await page.locator('[data-testid="overlay-file-input"]').setInputFiles({
    name: 'belo-horizonte.geojson',
    mimeType: 'application/geo+json',
    buffer: Buffer.from(LAT_FIRST_GEOJSON),
  });

  const dialog = page.getByRole('dialog', { name: 'Coordinate order' });
  await expect(dialog).toBeVisible();
  const position1 = page.locator('[data-testid="geojson-axis-position-1"]');
  await expect(position1).toBeFocused();
  await expect(position1).toHaveValue('longitude');
  await position1.selectOption('latitude');
  await expect(page.locator('[data-testid="geojson-axis-position-2"]')).toHaveValue('longitude');

  await page.locator('[data-testid="geojson-axis-confirm"]').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('belo-horizonte', { exact: true })).toBeVisible();

  // The gear on the boundary card reopens the dialog with the chosen order.
  await page.getByRole('button', { name: 'Coordinate order for belo-horizonte' }).click();
  await expect(dialog).toBeVisible();
  await expect(position1).toHaveValue('latitude');
  await expect(page.locator('[data-testid="geojson-axis-confirm"]')).toHaveText('Apply');
  await page.locator('[data-testid="geojson-axis-cancel"]').click();
  await expect(dialog).toBeHidden();
});
