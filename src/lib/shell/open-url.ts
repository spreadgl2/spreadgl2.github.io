function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const ALLOWED_EXTERNAL_HOSTS = new Set(['github.com', 'beast.community', 'doi.org', 'deck.gl']);

export function validateExternalUrl(href: string): string {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    throw new Error('External link is not a valid URL.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    !ALLOWED_EXTERNAL_HOSTS.has(url.hostname)
  ) {
    throw new Error('External link is not an approved HTTPS destination.');
  }
  return url.href;
}

export async function openUrl(href: string): Promise<void> {
  const approvedHref = validateExternalUrl(href);
  if (isTauri()) {
    const { openUrl: pluginOpenUrl } = await import('@tauri-apps/plugin-opener');
    await pluginOpenUrl(approvedHref);
  } else {
    window.open(approvedHref, '_blank', 'noopener,noreferrer');
  }
}
