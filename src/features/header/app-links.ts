const DEFAULT_PROJECT_URL = 'https://github.com/spreadgl2/spreadgl2.github.io';

function trustedRepositoryUrl(value: string | undefined): string {
  if (!value) return DEFAULT_PROJECT_URL;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'github.com' ||
      url.username !== '' ||
      url.password !== ''
    ) {
      return DEFAULT_PROJECT_URL;
    }
    return url.href.replace(/\/$/, '');
  } catch {
    return DEFAULT_PROJECT_URL;
  }
}

const PROJECT_URL = trustedRepositoryUrl(import.meta.env.VITE_REPOSITORY_URL);

export const DOCS_URL = `${PROJECT_URL}#readme`;
export const GITHUB_URL = PROJECT_URL;
export const ISSUES_URL = `${PROJECT_URL}/issues`;

// Referenced tools / prior work, linked inline in the About modal.
export const BEAST_URL = 'https://beast.community/';
export const SPREADGL_PAPER_URL = 'https://doi.org/10.1093/bioinformatics/btae721';
export const DECKGL_URL = 'https://deck.gl/';
