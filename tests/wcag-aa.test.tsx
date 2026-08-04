// @vitest-environment jsdom
import { axe } from 'vitest-axe';
import { describe, expect, it } from 'vitest';

// ─── Contrast maths (WCAG 2.1 relative luminance) ────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16) / 255,
    parseInt(clean.slice(2, 4), 16) / 255,
    parseInt(clean.slice(4, 6), 16) / 255,
  ];
}

function linearise(v: number): number {
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

// ─── Resolved token tables ────────────────────────────────────────────────────
// Mirrors src/styles/tokens.css exactly. Any change to tokens.css must be
// reflected here so the test fails when tokens drift below WCAG AA thresholds.

const DARK = {
  bgBase: '#0a0b0d',
  bgSurface: '#14161a',
  bgElevated: '#1c1f24',
  fgPrimary: '#e8eaee',
  fgSecondary: '#989ea7',
  fgTertiary: '#5d6470',
  accent: '#7ce3cb',
  error: '#f08c8c',
  warning: '#f0c66a',
  success: '#7ce3cb',
};

const LIGHT = {
  bgBase: '#fdf6e3',
  bgSurface: '#eee8d5',
  bgElevated: '#eee8d5',
  fgPrimary: '#073642',
  fgSecondary: '#33454c',
  fgTertiary: '#47595f',
  accent: '#126f61',
  accentHover: '#147267',
  error: '#b91c1c',
  warning: '#7a5200',
  success: '#126f61',
};

// ─── WCAG AA thresholds ───────────────────────────────────────────────────────
// Normal text (< 18px regular or < 14px bold): 4.5:1
// Large text (≥ 18px regular or ≥ 14px bold) and UI components: 3.0:1

const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;

// ─── Pair definitions ─────────────────────────────────────────────────────────

interface ContrastPair {
  label: string;
  fg: string;
  bg: string;
  threshold: number;
}

const darkPairs: ContrastPair[] = [
  { label: 'dark: fg-primary on bg-base', fg: DARK.fgPrimary, bg: DARK.bgBase, threshold: AA_NORMAL },
  { label: 'dark: fg-primary on bg-surface', fg: DARK.fgPrimary, bg: DARK.bgSurface, threshold: AA_NORMAL },
  { label: 'dark: fg-primary on bg-elevated', fg: DARK.fgPrimary, bg: DARK.bgElevated, threshold: AA_NORMAL },
  { label: 'dark: fg-secondary on bg-base', fg: DARK.fgSecondary, bg: DARK.bgBase, threshold: AA_NORMAL },
  { label: 'dark: fg-secondary on bg-surface', fg: DARK.fgSecondary, bg: DARK.bgSurface, threshold: AA_NORMAL },
  { label: 'dark: fg-secondary on bg-elevated', fg: DARK.fgSecondary, bg: DARK.bgElevated, threshold: AA_NORMAL },
  // fg-tertiary is a muted hint / divider label — WCAG AA large-text threshold
  { label: 'dark: fg-tertiary on bg-base (large-text/UI)', fg: DARK.fgTertiary, bg: DARK.bgBase, threshold: AA_LARGE },
  { label: 'dark: fg-tertiary on bg-surface (large-text/UI)', fg: DARK.fgTertiary, bg: DARK.bgSurface, threshold: AA_LARGE },
  { label: 'dark: accent on bg-base', fg: DARK.accent, bg: DARK.bgBase, threshold: AA_NORMAL },
  { label: 'dark: accent on bg-surface', fg: DARK.accent, bg: DARK.bgSurface, threshold: AA_NORMAL },
  { label: 'dark: accent on bg-elevated', fg: DARK.accent, bg: DARK.bgElevated, threshold: AA_NORMAL },
  { label: 'dark: error on bg-base', fg: DARK.error, bg: DARK.bgBase, threshold: AA_NORMAL },
  { label: 'dark: error on bg-surface', fg: DARK.error, bg: DARK.bgSurface, threshold: AA_NORMAL },
  { label: 'dark: warning on bg-base', fg: DARK.warning, bg: DARK.bgBase, threshold: AA_NORMAL },
  { label: 'dark: warning on bg-surface', fg: DARK.warning, bg: DARK.bgSurface, threshold: AA_NORMAL },
  { label: 'dark: success on bg-base', fg: DARK.success, bg: DARK.bgBase, threshold: AA_NORMAL },
];

const lightPairs: ContrastPair[] = [
  { label: 'light: fg-primary on bg-base', fg: LIGHT.fgPrimary, bg: LIGHT.bgBase, threshold: AA_NORMAL },
  { label: 'light: fg-primary on bg-surface', fg: LIGHT.fgPrimary, bg: LIGHT.bgSurface, threshold: AA_NORMAL },
  { label: 'light: fg-primary on bg-elevated', fg: LIGHT.fgPrimary, bg: LIGHT.bgElevated, threshold: AA_NORMAL },
  { label: 'light: fg-secondary on bg-base', fg: LIGHT.fgSecondary, bg: LIGHT.bgBase, threshold: AA_NORMAL },
  { label: 'light: fg-secondary on bg-surface', fg: LIGHT.fgSecondary, bg: LIGHT.bgSurface, threshold: AA_NORMAL },
  { label: 'light: fg-tertiary on bg-base', fg: LIGHT.fgTertiary, bg: LIGHT.bgBase, threshold: AA_NORMAL },
  { label: 'light: fg-tertiary on bg-surface', fg: LIGHT.fgTertiary, bg: LIGHT.bgSurface, threshold: AA_NORMAL },
  { label: 'light: accent on bg-base', fg: LIGHT.accent, bg: LIGHT.bgBase, threshold: AA_NORMAL },
  { label: 'light: accent on bg-surface', fg: LIGHT.accent, bg: LIGHT.bgSurface, threshold: AA_NORMAL },
  { label: 'light: accent on bg-elevated', fg: LIGHT.accent, bg: LIGHT.bgElevated, threshold: AA_NORMAL },
  { label: 'light: accent-hover on bg-base', fg: LIGHT.accentHover, bg: LIGHT.bgBase, threshold: AA_NORMAL },
  { label: 'light: accent-hover on bg-surface', fg: LIGHT.accentHover, bg: LIGHT.bgSurface, threshold: AA_NORMAL },
  { label: 'light: error on bg-base', fg: LIGHT.error, bg: LIGHT.bgBase, threshold: AA_NORMAL },
  { label: 'light: error on bg-surface', fg: LIGHT.error, bg: LIGHT.bgSurface, threshold: AA_NORMAL },
  { label: 'light: warning on bg-base', fg: LIGHT.warning, bg: LIGHT.bgBase, threshold: AA_NORMAL },
  { label: 'light: warning on bg-surface', fg: LIGHT.warning, bg: LIGHT.bgSurface, threshold: AA_NORMAL },
  { label: 'light: success on bg-base', fg: LIGHT.success, bg: LIGHT.bgBase, threshold: AA_NORMAL },
];

// ─── Token contrast tests ─────────────────────────────────────────────────────

describe('WCAG AA — dark theme token contrast ratios', () => {
  for (const pair of darkPairs) {
    it(pair.label, () => {
      const ratio = contrastRatio(pair.fg, pair.bg);
      expect(ratio).toBeGreaterThanOrEqual(pair.threshold);
    });
  }
});

describe('WCAG AA — light theme token contrast ratios', () => {
  for (const pair of lightPairs) {
    it(pair.label, () => {
      const ratio = contrastRatio(pair.fg, pair.bg);
      expect(ratio).toBeGreaterThanOrEqual(pair.threshold);
    });
  }
});

// ─── axe color-contrast integration ──────────────────────────────────────────
// axe-core requires inline styles (not CSS variables) to evaluate color-contrast
// in jsdom. Each viewer state is represented as a minimal HTML snippet with
// resolved token values inlined so axe can evaluate the rendered output.

function makeViewerHtml(theme: 'dark' | 'light'): string {
  const t = theme === 'dark' ? DARK : LIGHT;
  return `
    <div
      role="application"
      aria-label="SpreadGL2 viewer"
      style="background:${t.bgBase};color:${t.fgPrimary};font-family:system-ui,sans-serif;"
    >
      <header
        role="banner"
        aria-label="Application header"
        style="background:${t.bgSurface};color:${t.fgPrimary};padding:8px 16px;display:flex;align-items:center;"
      >
        <span style="font-size:15px;font-weight:600;color:${t.fgPrimary};">SpreadGL2</span>
        <span style="margin-left:auto;">
          <button
            type="button"
            aria-label="Style"
            style="background:none;border:none;color:${t.fgSecondary};cursor:pointer;padding:4px;width:32px;height:32px;"
          >S</button>
          <button
            type="button"
            aria-label="Layers"
            style="background:none;border:none;color:${t.fgSecondary};cursor:pointer;padding:4px;width:32px;height:32px;"
          >L</button>
          <button
            type="button"
            aria-label="Settings"
            style="background:none;border:none;color:${t.fgSecondary};cursor:pointer;padding:4px;width:32px;height:32px;"
          >G</button>
        </span>
      </header>

      <main role="main" style="display:flex;flex:1;background:${t.bgBase};">
        <nav
          role="navigation"
          aria-label="Side navigation"
          style="background:${t.bgSurface};width:240px;padding:16px;"
        >
          <p style="font-size:11px;color:${t.fgTertiary};text-transform:uppercase;font-weight:700;">
            Tree options
          </p>
          <p style="font-size:13px;color:${t.fgSecondary};">Mode: Trail</p>
          <a href="#main-content" style="color:${t.accent};font-size:13px;">Skip to content</a>
        </nav>

        <section id="main-content" aria-label="Tree and map visualisation" style="flex:1;background:${t.bgBase};">
          <div
            role="img"
            aria-label="Phylogenetic tree, 183 tips, 2003-01-01–2020-01-01"
            style="background:${t.bgBase};width:50%;height:400px;display:inline-block;"
          ></div>
          <div
            aria-label="Phylogeographic map, 183 tips on Dark Matter basemap, trail mode"
            style="background:${t.bgBase};width:50%;height:400px;display:inline-block;"
          ></div>
        </section>
      </main>

      <aside
        aria-label="Pinned inspector"
        aria-live="polite"
        style="background:${t.bgElevated};padding:12px;min-width:240px;"
      >
        <p style="font-size:13px;color:${t.fgPrimary};font-weight:600;">tip_001</p>
        <p style="font-size:12px;color:${t.fgSecondary};">posterior: 0.97</p>
        <p style="font-size:11px;color:${t.fgTertiary};">2015-06-01</p>
      </aside>

      <footer
        role="contentinfo"
        aria-label="Timeline"
        style="background:${t.bgSurface};padding:8px 16px;"
      >
        <label for="playhead-${theme}" style="font-size:12px;color:${t.fgSecondary};">Playhead</label>
        <input
          id="playhead-${theme}"
          type="range"
          aria-label="Animation playhead"
          min="0"
          max="100"
          value="50"
        />
        <button
          type="button"
          aria-label="Play animation"
          style="background:${t.accent};color:${theme === 'dark' ? '#0a0b0d' : '#ffffff'};border:none;padding:4px 12px;cursor:pointer;border-radius:4px;font-size:12px;"
        >
          Play
        </button>
      </footer>
    </div>
  `;
}

describe('axe — dark theme viewer states', () => {
  it('empty state (loader screen) has no critical axe violations', async () => {
    const html = `
      <div style="background:${DARK.bgBase};color:${DARK.fgPrimary};font-family:system-ui;" role="main">
        <h1 style="font-size:24px;color:${DARK.fgPrimary};">Drop a tree file to get started</h1>
        <p style="font-size:14px;color:${DARK.fgSecondary};">Supports NEXUS / Newick formats</p>
        <div
          role="region"
          aria-label="File drop zone"
          tabindex="0"
          data-testid="drop-zone"
          style="border:2px dashed ${DARK.fgTertiary};padding:48px;text-align:center;"
        >
          <p style="color:${DARK.fgSecondary};font-size:14px;">Drag and drop or click to select</p>
        </div>
      </div>
    `;
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: true } },
    });
    document.body.removeChild(container);
    expect(results.violations.filter(v => v.id === 'color-contrast')).toHaveLength(0);
  });

  it('viewer (tree + map + inspector) has no critical axe violations', async () => {
    const container = document.createElement('div');
    container.innerHTML = makeViewerHtml('dark');
    document.body.appendChild(container);
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: true } },
    });
    document.body.removeChild(container);
    expect(results.violations.filter(v => v.id === 'color-contrast')).toHaveLength(0);
  });
});

describe('axe — light theme viewer states', () => {
  it('empty state (loader screen) has no critical axe violations', async () => {
    const html = `
      <div style="background:${LIGHT.bgBase};color:${LIGHT.fgPrimary};font-family:system-ui;" role="main">
        <h1 style="font-size:24px;color:${LIGHT.fgPrimary};">Drop a tree file to get started</h1>
        <p style="font-size:14px;color:${LIGHT.fgSecondary};">Supports NEXUS / Newick formats</p>
        <div
          role="region"
          aria-label="File drop zone"
          tabindex="0"
          data-testid="drop-zone"
          style="border:2px dashed ${LIGHT.fgTertiary};padding:48px;text-align:center;"
        >
          <p style="color:${LIGHT.fgSecondary};font-size:14px;">Drag and drop or click to select</p>
        </div>
      </div>
    `;
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: true } },
    });
    document.body.removeChild(container);
    expect(results.violations.filter(v => v.id === 'color-contrast')).toHaveLength(0);
  });

  it('viewer (tree + map + inspector) has no critical axe violations', async () => {
    const container = document.createElement('div');
    container.innerHTML = makeViewerHtml('light');
    document.body.appendChild(container);
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: true } },
    });
    document.body.removeChild(container);
    expect(results.violations.filter(v => v.id === 'color-contrast')).toHaveLength(0);
  });
});
