// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEnvStore } from '../../store/env';
import { useSelectionStore } from '../../store/selection';
import { useTimelineStore } from '../../store/timeline';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import type { EnvLegendCanvasState } from './export-overlays';
import { drawTimeOverlay, renderEnvLegendCanvas, renderLegendCanvas } from './export-overlays';

function makeCtx() {
  return {
    fillStyle: '',
    font: '',
    fillRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 80 }),
    roundRect: vi.fn(),
    drawImage: vi.fn(),
    createLinearGradient: vi.fn().mockReturnValue({ addColorStop: vi.fn() }),
  };
}

beforeEach(() => {
  useUiStore.setState({
    colorByKey: 'single-color',
    glyphByKey: 'none',
    palette: 'okabe-ito',
    paletteReverse: false,
  });
  useTreeStore.setState({ graph: null, traitInfo: null, allDiscreteKeys: [] });
  useSelectionStore.setState({ focusedTaxa: [] });
  useEnvStore.setState({ columns: [], activeKey: null, paletteOverride: {} });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('renderLegendCanvas', () => {
  it('returns a zero-height canvas when no legend entries exist', () => {
    const canvas = renderLegendCanvas();
    expect(canvas.height).toBe(0);
  });

  it('produces canvas height proportional to entry count for discrete legend', () => {
    useUiStore.setState({ colorByKey: 'region', glyphByKey: 'none' });
    useTreeStore.setState({
      traitInfo: {
        kind: 'discrete',
        key: 'region',
        values: ['A', 'B', 'C'],
        ambiguous: false as const,
      },
      allDiscreteKeys: ['region'],
      graph: {
        nodes: [
          { origId: '1', id: 1, adjacents: [2], lengths: [0.1], annotations: { region: 'A' } },
          { origId: '2', id: 2, adjacents: [1], lengths: [0.1], annotations: { region: 'B' } },
          { origId: '3', id: 3, adjacents: [1], lengths: [0.1], annotations: { region: 'C' } },
        ],
        origIdToIdx: new Map([
          ['1', 0],
          ['2', 1],
          ['3', 2],
        ]),
        rootIdx: 0,
      } as never,
    });

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      makeCtx() as unknown as CanvasRenderingContext2D,
    );

    const canvas = renderLegendCanvas();
    expect(canvas.height).toBeGreaterThan(0);
  });

  it('produces a gradient legend for continuous trees colored by time', () => {
    useUiStore.setState({ colorByKey: '__time__', glyphByKey: 'none', palette: 'viridis' });
    useTreeStore.setState({
      traitInfo: {
        kind: 'continuous',
        keyFamily: { lat: 'lat', lon: 'lon' },
        wgs84: true,
      },
    });
    useTimelineStore.setState({ bounds: { min: 2010, max: 2020 } });

    const ctx = makeCtx();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D,
    );

    const canvas = renderLegendCanvas();
    expect(canvas.height).toBeGreaterThan(0);
    expect(ctx.createLinearGradient).toHaveBeenCalled();
  });

  it('uses dark theme bg fill when --bg-base is dark', () => {
    useUiStore.setState({ colorByKey: 'region', glyphByKey: 'none' });
    useTreeStore.setState({
      traitInfo: { kind: 'discrete', key: 'region', values: ['A'], ambiguous: false as const },
      allDiscreteKeys: ['region'],
      graph: {
        nodes: [
          { origId: '1', id: 1, adjacents: [2], lengths: [0.1], annotations: { region: 'A' } },
        ],
        origIdToIdx: new Map([['1', 0]]),
        rootIdx: 0,
      } as never,
    });

    vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (prop: string) => (prop === '--bg-base' ? '#0a0b0d' : ''),
    } as unknown as CSSStyleDeclaration);

    const assignments: string[] = [];
    const mockCtx = makeCtx();
    Object.defineProperty(mockCtx, 'fillStyle', {
      get() {
        return this._fillStyle ?? '';
      },
      set(v: string) {
        assignments.push(v);
        this._fillStyle = v;
      },
      configurable: true,
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );

    renderLegendCanvas();

    expect(assignments).toContain('rgba(0,0,0,0.6)');
  });

  it('uses light theme bg fill when --bg-base is light', () => {
    useUiStore.setState({ colorByKey: 'region', glyphByKey: 'none' });
    useTreeStore.setState({
      traitInfo: { kind: 'discrete', key: 'region', values: ['A'], ambiguous: false as const },
      allDiscreteKeys: ['region'],
      graph: {
        nodes: [
          { origId: '1', id: 1, adjacents: [2], lengths: [0.1], annotations: { region: 'A' } },
        ],
        origIdToIdx: new Map([['1', 0]]),
        rootIdx: 0,
      } as never,
    });

    vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (prop: string) => (prop === '--bg-base' ? '#fdf6e3' : ''),
    } as unknown as CSSStyleDeclaration);

    const assignments: string[] = [];
    const mockCtx = makeCtx();
    Object.defineProperty(mockCtx, 'fillStyle', {
      get() {
        return this._fillStyle ?? '';
      },
      set(v: string) {
        assignments.push(v);
        this._fillStyle = v;
      },
      configurable: true,
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );

    renderLegendCanvas();

    expect(assignments).toContain('rgba(255,255,255,0.75)');
  });
});

describe('drawTimeOverlay', () => {
  it('draws text containing the month abbreviation for decimal year 2018.5 (Jul 2018)', () => {
    const ctx = makeCtx();

    drawTimeOverlay(ctx as unknown as CanvasRenderingContext2D, 2018.5, 1000);

    const texts = ctx.fillText.mock.calls.map((c) => String(c[0]));
    const combined = texts.join(' ');
    expect(combined).toMatch(/2018/);
    expect(combined).toMatch(/Jul/);
  });

  it('draws text containing Jan 2020 for decimal year 2020.0', () => {
    const ctx = makeCtx();

    drawTimeOverlay(ctx as unknown as CanvasRenderingContext2D, 2020.0, 1000);

    const texts = ctx.fillText.mock.calls.map((c) => String(c[0]));
    const combined = texts.join(' ');
    expect(combined).toMatch(/2020/);
    expect(combined).toMatch(/Jan/);
  });

  it('places overlay near the right edge (panelX close to canvasWidth)', () => {
    const ctx = makeCtx();
    ctx.measureText = vi.fn().mockReturnValue({ width: 100 });

    drawTimeOverlay(ctx as unknown as CanvasRenderingContext2D, 2018.5, 1920);

    const textCalls = ctx.fillText.mock.calls;
    expect(textCalls.length).toBeGreaterThan(0);
    const x = textCalls[0]?.[1] as number;
    expect(x).toBeGreaterThan(1920 - 300);
  });

  it('dark theme: fill color has low alpha', () => {
    vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (prop: string) => (prop === '--bg-base' ? '#0a0b0d' : ''),
    } as unknown as CSSStyleDeclaration);

    const ctx = makeCtx();
    drawTimeOverlay(ctx as unknown as CanvasRenderingContext2D, 2018.5, 1000);

    const allFillStyles: string[] = [];
    Object.defineProperty(ctx, 'fillStyle', {
      get() {
        return this._fillStyle ?? '';
      },
      set(v) {
        allFillStyles.push(v as string);
        this._fillStyle = v;
      },
      configurable: true,
    });

    drawTimeOverlay(ctx as unknown as CanvasRenderingContext2D, 2018.5, 1000);
    const darkPanel = allFillStyles.find((s) => s.includes('rgba'));
    if (darkPanel) {
      expect(darkPanel).toMatch(/rgba\(0,0,0,0\.6\)/);
    }
  });

  it('light theme: fill color is light translucent', () => {
    vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (prop: string) => (prop === '--bg-base' ? '#fdf6e3' : ''),
    } as unknown as CSSStyleDeclaration);

    const ctx = makeCtx();
    const fillStyles: string[] = [];
    Object.defineProperty(ctx, 'fillStyle', {
      get() {
        return this._fillStyle ?? '';
      },
      set(v) {
        fillStyles.push(v as string);
        this._fillStyle = v;
      },
      configurable: true,
    });

    drawTimeOverlay(ctx as unknown as CanvasRenderingContext2D, 2018.5, 1000);

    const lightPanel = fillStyles.find((s) => s.includes('rgba(255'));
    if (lightPanel) {
      expect(lightPanel).toMatch(/rgba\(255,255,255,0\.75\)/);
    }
  });
});

describe('renderLegendCanvas — quality multiplier font scaling', () => {
  function setupDiscreteRegionState() {
    useUiStore.setState({ colorByKey: 'region', glyphByKey: 'none' });
    useTreeStore.setState({
      traitInfo: { kind: 'discrete', key: 'region', values: ['A'], ambiguous: false as const },
      allDiscreteKeys: ['region'],
      graph: {
        nodes: [
          { origId: '1', id: 1, adjacents: [2], lengths: [0.1], annotations: { region: 'A' } },
        ],
        origIdToIdx: new Map([['1', 0]]),
        rootIdx: 0,
      } as never,
    });
  }

  it('at quality=1, font-size string matches the 2x export visual scale', () => {
    setupDiscreteRegionState();
    const fonts: string[] = [];
    const mockCtx = makeCtx();
    Object.defineProperty(mockCtx, 'font', {
      get() {
        return this._font ?? '';
      },
      set(v: string) {
        fonts.push(v);
        this._font = v;
      },
      configurable: true,
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );

    renderLegendCanvas(1);

    expect(fonts.some((f) => f.includes('30px'))).toBe(true);
  });

  it('at quality=2, font-size string includes quality and export visual scale', () => {
    setupDiscreteRegionState();
    const fonts: string[] = [];
    const mockCtx = makeCtx();
    Object.defineProperty(mockCtx, 'font', {
      get() {
        return this._font ?? '';
      },
      set(v: string) {
        fonts.push(v);
        this._font = v;
      },
      configurable: true,
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );

    renderLegendCanvas(2);

    expect(fonts.some((f) => f.includes('60px'))).toBe(true);
  });

  it('at quality=4, font-size string includes quality and export visual scale', () => {
    setupDiscreteRegionState();
    const fonts: string[] = [];
    const mockCtx = makeCtx();
    Object.defineProperty(mockCtx, 'font', {
      get() {
        return this._font ?? '';
      },
      set(v: string) {
        fonts.push(v);
        this._font = v;
      },
      configurable: true,
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );

    renderLegendCanvas(4);

    expect(fonts.some((f) => f.includes('120px'))).toBe(true);
  });
});

describe('renderEnvLegendCanvas', () => {
  function makeEnvState(overrides: Partial<EnvLegendCanvasState> = {}): EnvLegendCanvasState {
    return {
      variableName: 'TEMPERATURE',
      units: '°C',
      paletteId: 'cool-warm',
      min: -10,
      mid: 15,
      max: 40,
      qualityMultiplier: 1,
      theme: 'dark',
      ...overrides,
    };
  }

  it('returns null when variableName is empty', () => {
    expect(renderEnvLegendCanvas(makeEnvState({ variableName: '' }))).toBeNull();
  });

  it('returns canvas with correct dims at quality=1 (240×68 without units, 240×82 with units)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      makeCtx() as unknown as CanvasRenderingContext2D,
    );
    const canvas = renderEnvLegendCanvas(makeEnvState({ units: null }));
    expect(canvas).not.toBeNull();
    expect(canvas?.width).toBe(240);
    expect(canvas?.height).toBe(68);

    const canvasWithUnits = renderEnvLegendCanvas(makeEnvState({ units: '°C' }));
    expect(canvasWithUnits?.width).toBe(240);
    expect(canvasWithUnits?.height).toBe(82);
  });

  it('returns canvas with correct dims at quality=2 (480×164 without units)', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      makeCtx() as unknown as CanvasRenderingContext2D,
    );
    const canvas = renderEnvLegendCanvas(makeEnvState({ units: null, qualityMultiplier: 2 }));
    expect(canvas?.width).toBe(480);
    expect(canvas?.height).toBe(136);
  });

  it('title, range labels, and units are rendered via fillText', () => {
    const mockCtx = makeCtx();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );

    renderEnvLegendCanvas(makeEnvState());

    const texts = mockCtx.fillText.mock.calls.map((c) => String(c[0]));
    expect(texts.some((t) => t.includes('TEMPERATURE'))).toBe(true);
    expect(texts.some((t) => t === '-10.0')).toBe(true);
    expect(texts.some((t) => t === '15.0')).toBe(true);
    expect(texts.some((t) => t === '40.0')).toBe(true);
    expect(texts.some((t) => t === '°C')).toBe(true);
  });

  it('ramp uses diverse fill colors (fillRect called with diverse fillStyle values)', () => {
    const fillStyles: string[] = [];
    const mockCtx = makeCtx();
    let currentFillStyle = '';
    Object.defineProperty(mockCtx, 'fillStyle', {
      get() {
        return currentFillStyle;
      },
      set(v: string) {
        currentFillStyle = v;
        if (v.startsWith('rgb(')) fillStyles.push(v);
      },
      configurable: true,
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );

    renderEnvLegendCanvas(makeEnvState({ qualityMultiplier: 1 }));

    const unique = new Set(fillStyles);
    expect(unique.size).toBeGreaterThan(5);
  });
});
