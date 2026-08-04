import type { Page } from '@playwright/test';

/**
 * Get past the Import Settings modal.
 *
 * Every route into the viewer — drag-and-drop, the bundled example buttons,
 * the file picker — now shows a parse preview and waits for the detected
 * defaults to be confirmed. Until that happens the viewer never mounts, so
 * `btn-play` and everything downstream of it never appear.
 *
 * This lives in a shared helper rather than being copied per spec because the
 * suite went red across eight files when the modal landed, and each spec had
 * its own private copy of the load sequence. One place to fix next time.
 *
 * Tolerant by design: if the modal does not appear within the timeout this
 * returns quietly and lets the caller's own assertion report the real failure,
 * rather than masking it with a confusing error about a confirm button.
 */
export async function confirmImportSettings(page: Page, timeoutMs = 60_000): Promise<void> {
  const confirmBtn = page.locator('[data-testid="import-settings-confirm"]');
  try {
    await confirmBtn.waitFor({ state: 'visible', timeout: timeoutMs });
  } catch {
    return;
  }
  await confirmBtn.click();
}
