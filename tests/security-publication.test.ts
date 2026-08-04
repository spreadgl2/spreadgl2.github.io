import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

describe('publication security configuration', () => {
  it('enforces a web CSP without remote script execution', () => {
    const html = read('index.html');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("script-src 'self'");
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("base-uri 'none'");
    expect(html).toContain('https://*.basemaps.cartocdn.com');
    expect(html).not.toMatch(/script-src[^;]*https:/);
  });

  it('enforces Tauri CSP and excludes free-form file-read authority', () => {
    const config = JSON.parse(read('src-tauri/tauri.conf.json')) as {
      app: { security: { csp: string } };
    };
    const capabilities = read('src-tauri/capabilities/default.json');
    const rust = read('src-tauri/src/lib.rs');
    expect(config.app.security.csp).toContain("default-src 'self'");
    expect(config.app.security.csp).toContain('connect-src');
    expect(config.app.security.csp).toContain('ipc:');
    expect(capabilities).not.toMatch(/(?:dialog|fs|opener|store|deep-link):default/);
    expect(rust).not.toContain('read_text_file');
    expect(rust).toContain('take_pending_tree_file');
  });

  it('contains no telemetry dependency or implementation markers', () => {
    const packageJson = read('package.json');
    const sourceFiles = [packageJson, read('src/App.tsx'), read('README.md')].join('\n');
    expect(sourceFiles).not.toMatch(/@sentry|VITE_SENTRY_DSN|telemetry-consent/i);
  });

  it('pins every workflow action to an immutable commit', () => {
    const workflows = [
      '.github/workflows/ci.yml',
      '.github/workflows/pages.yml',
      '.github/workflows/release-build.yml',
      '.github/workflows/security.yml',
      '.github/workflows/stress.yml',
    ];
    for (const workflow of workflows) {
      for (const match of read(workflow).matchAll(/uses:\s+[^\s@]+@([^\s#]+)/g)) {
        expect(match[1], `${workflow}: ${match[0]}`).toMatch(/^[0-9a-f]{40}$/);
      }
    }
  });

  it('does not prefetch third-party basemap resources on cold start', () => {
    const warmup = read('src/features/viewer/cold-start-warmup.ts');
    expect(warmup).not.toContain('fetch(');
    expect(warmup).not.toMatch(/CARTO|cartocdn|BASEMAP_URLS/);
  });
});
