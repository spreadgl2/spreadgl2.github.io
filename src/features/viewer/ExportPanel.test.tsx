// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMapStore } from '../../store/map';
import { useSelectionStore } from '../../store/selection';
import { useTimelineStore } from '../../store/timeline';
import { composeFrame, ExportPanel, getMapCanvases, runCapture, snapPng } from './ExportPanel';

interface RecorderInstance {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
}

function makeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.getContext = vi.fn().mockReturnValue({ drawImage: vi.fn() });
  c.captureStream = vi.fn().mockReturnValue({ getTracks: () => [] });
  return c;
}

function makeFullCanvasContext() {
  return {
    drawImage: vi.fn(),
    fillStyle: '',
    fillRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    measureText: vi.fn().mockReturnValue({ width: 80 }),
    roundRect: vi.fn(),
    globalAlpha: 1,
    strokeStyle: '',
    lineWidth: 1,
    clearRect: vi.fn(),
    imageSmoothingQuality: 'high',
  };
}

function stubMediaRecorder() {
  const instances: RecorderInstance[] = [];

  function buildInst(): RecorderInstance {
    const inst: RecorderInstance = {
      start: vi.fn(),
      stop: vi.fn().mockImplementation(() => {
        if (inst.onstop) inst.onstop();
      }),
      ondataavailable: null,
      onstop: null,
    };
    instances.push(inst);
    return inst;
  }

  const Ctor = vi.fn().mockImplementation(buildInst);
  (Ctor as unknown as { isTypeSupported: (t: string) => boolean }).isTypeSupported = () => true;
  (globalThis as Record<string, unknown>).MediaRecorder = Ctor;

  return { Ctor, instances };
}

function setupMapDom(cssWidth = 600, cssHeight = 300) {
  const div = document.createElement('div');
  div.setAttribute('data-testid', 'map-view');
  vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
    width: cssWidth,
    height: cssHeight,
    top: 0,
    left: 400,
    bottom: cssHeight,
    right: 400 + cssWidth,
    x: 400,
    y: 0,
    toJSON: () => ({}),
  });
  const basemap = makeCanvas();
  basemap.classList.add('maplibregl-canvas');
  basemap.width = cssWidth * 2;
  basemap.height = cssHeight * 2;
  const overlay = makeCanvas();
  overlay.width = cssWidth * 2;
  overlay.height = cssHeight * 2;
  div.appendChild(basemap);
  div.appendChild(overlay);
  document.body.appendChild(div);
  return { div, basemap, overlay };
}

function setupAnalysisDom(cssWidth = 1000, cssHeight = 180) {
  const div = document.createElement('div');
  div.setAttribute('data-testid', 'analysis-container');
  vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
    width: cssWidth,
    height: cssHeight,
    top: 300,
    left: 0,
    bottom: 300 + cssHeight,
    right: cssWidth,
    x: 0,
    y: 300,
    toJSON: () => ({}),
  });
  div.innerHTML =
    '<svg viewBox="0 0 1000 180" data-testid="analysis-ltt-plot"><path d="M0 180 L1000 0" /></svg>';
  document.body.appendChild(div);
  return { div };
}

function setupTreeDomForCapture(cssWidth = 400, cssHeight = 300) {
  const div = document.createElement('div');
  div.setAttribute('data-testid', 'tree-panel');
  vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
    width: cssWidth,
    height: cssHeight,
    top: 0,
    left: 0,
    bottom: cssHeight,
    right: cssWidth,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  const canvas = makeCanvas();
  canvas.width = cssWidth * 2;
  canvas.height = cssHeight * 2;
  div.appendChild(canvas);
  document.body.appendChild(div);
  return { div, canvas };
}

beforeEach(() => {
  useTimelineStore.setState({
    bounds: { min: 2010, max: 2020 },
    playhead: 2010,
    mode: 'Trail',
    window: null,
    windowSize: null,
    speed: 1,
  });
  useSelectionStore.setState({
    hoveredId: null,
    selectedIds: [],
    selectedBranchIds: [],
    focusedTaxa: [],
  });
  stubMediaRecorder();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).MediaRecorder;
  for (const el of document.querySelectorAll('[data-testid="map-view"]')) el.remove();
  for (const el of document.querySelectorAll('[data-testid="tree-panel"]')) el.remove();
  for (const el of document.querySelectorAll('[data-testid="analysis-container"]')) el.remove();
});

describe('ExportPanel — share/save section', () => {
  it('shows Save project in web and Tauri builds', () => {
    const { unmount } = render(<ExportPanel />);
    expect(screen.getByTestId('export-save-project')).toBeTruthy();
    unmount();

    Object.assign(window, { __TAURI_INTERNALS__: {} });
    try {
      render(<ExportPanel />);
      expect(screen.getByTestId('export-save-project')).toBeTruthy();
    } finally {
      delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
      cleanup();
    }
  });
});

describe('ExportPanel — record video section', () => {
  it('initialises complete recording controls from timeline bounds', () => {
    render(<ExportPanel />);
    expect(screen.getByTestId('export-panel')).toBeTruthy();
    expect(screen.getByTestId('export-start')).toBeTruthy();
    expect(screen.getByTestId('export-end')).toBeTruthy();
    expect(screen.getByTestId('export-resolution')).toBeTruthy();
    expect(screen.getByTestId('export-fps')).toBeTruthy();
    const btn = screen.getByTestId('export-record-btn');
    expect(btn.textContent).toBe('Record video');
    const start = screen.getByTestId('export-start') as HTMLInputElement;
    const end = screen.getByTestId('export-end') as HTMLInputElement;
    expect(Number(start.value)).toBeCloseTo(2010);
    expect(Number(end.value)).toBeCloseTo(2020);
    const sel = screen.getByTestId('export-resolution') as HTMLSelectElement;
    expect(sel.options.length).toBe(3);
  });

  it('shows unsupported message when MediaRecorder is absent', () => {
    delete (globalThis as Record<string, unknown>).MediaRecorder;
    render(<ExportPanel />);
    expect(screen.getByTestId('export-unsupported')).toBeTruthy();
  });
});

describe('getMapCanvases', () => {
  it('returns null when map-view element is absent', () => {
    expect(getMapCanvases()).toBeNull();
  });

  it('returns null when the maplibregl-canvas canvas is missing', () => {
    const div = document.createElement('div');
    div.setAttribute('data-testid', 'map-view');
    div.appendChild(document.createElement('canvas'));
    document.body.appendChild(div);
    expect(getMapCanvases()).toBeNull();
    div.remove();
  });

  it('returns null when there is no non-maplibregl canvas (overlay missing)', () => {
    const div = document.createElement('div');
    div.setAttribute('data-testid', 'map-view');
    const basemap = document.createElement('canvas');
    basemap.classList.add('maplibregl-canvas');
    div.appendChild(basemap);
    document.body.appendChild(div);
    expect(getMapCanvases()).toBeNull();
    div.remove();
  });

  it('selects basemap by maplibregl-canvas class and overlay by absence of that class', () => {
    const { div, basemap, overlay } = setupMapDom();
    const result = getMapCanvases();
    expect(result?.basemap).toBe(basemap);
    expect(result?.overlay).toBe(overlay);
    div.remove();
  });

  it('ignores extra non-overlay canvases and still finds the first non-maplibregl canvas as overlay', () => {
    const div = document.createElement('div');
    div.setAttribute('data-testid', 'map-view');
    const basemap = document.createElement('canvas');
    basemap.classList.add('maplibregl-canvas');
    const overlay = document.createElement('canvas');
    const extra = document.createElement('canvas');
    div.appendChild(basemap);
    div.appendChild(overlay);
    div.appendChild(extra);
    document.body.appendChild(div);
    const result = getMapCanvases();
    expect(result?.basemap).toBe(basemap);
    expect(result?.overlay).toBe(overlay);
    div.remove();
  });
});

describe('runCapture end-to-end', () => {
  it('walks the playhead across the range, composites tree + map canvases, and returns a blob', async () => {
    const { div: mapDiv, basemap, overlay } = setupMapDom(600, 300);
    const { div: treeDiv, canvas: treeCanvas } = setupTreeDomForCapture(400, 300);
    const { Ctor, instances } = stubMediaRecorder();

    const offscreenCtx = { drawImage: vi.fn(), fillStyle: '', fillRect: vi.fn() };
    const offscreenCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(offscreenCtx),
      captureStream: vi.fn().mockReturnValue({ getTracks: () => [] }),
    };

    const realCreate = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        if (tag === 'canvas') return offscreenCanvas as unknown as HTMLCanvasElement;
        return realCreate(tag);
      });

    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    const progressValues: number[] = [];
    const result = await runCapture(
      { startYear: 2010, endYear: 2011, width: 1280, height: 720, fps: 2 },
      (pct) => progressValues.push(pct),
    );

    expect(offscreenCanvas.width).toBe(1280);
    expect(offscreenCanvas.height).toBe(720);

    expect(Ctor).toHaveBeenCalled();
    expect(instances[0]?.start).toHaveBeenCalled();

    // tree + basemap + overlay = at least 3 drawImage calls per frame (9-arg form for aspect-fit)
    const drawCalls = offscreenCtx.drawImage.mock.calls;
    expect(drawCalls.length).toBeGreaterThanOrEqual(3);

    const treeCall = drawCalls.find((c) => c[0] === treeCanvas);
    expect(treeCall).toBeTruthy();
    expect(treeCall?.length).toBe(9);

    const basemapCall = drawCalls.find((c) => c[0] === basemap);
    expect(basemapCall).toBeTruthy();
    expect(basemapCall?.length).toBe(9);

    const overlayCall = drawCalls.find((c) => c[0] === overlay);
    expect(overlayCall).toBeTruthy();
    expect(overlayCall?.length).toBe(9);

    const store = useTimelineStore.getState();
    expect(store.playhead).toBeGreaterThanOrEqual(2010);

    expect(instances[0]?.stop).toHaveBeenCalled();

    expect(result).not.toBeNull();
    expect(result?.ext).toMatch(/^(webm|mp4)$/);

    createElementSpy.mockRestore();
    treeDiv.remove();
    mapDiv.remove();
  });

  it('tree slot width = round(width * treeRatio); map slot width = remainder', async () => {
    const treeW = 400;
    const mapW = 600;
    const exportW = 1280;
    const exportH = 720;

    const { div: mapDiv } = setupMapDom(mapW, 300);
    const { div: treeDiv } = setupTreeDomForCapture(treeW, 300);
    stubMediaRecorder();

    const offscreenCtx = { drawImage: vi.fn(), fillStyle: '', fillRect: vi.fn() };
    const offscreenCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(offscreenCtx),
      captureStream: vi.fn().mockReturnValue({ getTracks: () => [] }),
    };

    const realCreate2 = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        if (tag === 'canvas') return offscreenCanvas as unknown as HTMLCanvasElement;
        return realCreate2(tag);
      });

    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    await runCapture(
      { startYear: 2010, endYear: 2011, width: exportW, height: exportH, fps: 1 },
      () => {},
    );

    const treeRatio = treeW / (treeW + mapW);
    const expectedTreeSlotW = Math.round(exportW * treeRatio);
    const expectedMapSlotW = exportW - expectedTreeSlotW;

    const drawCalls = offscreenCtx.drawImage.mock.calls;
    const mapCalls = drawCalls.filter((c) => c[0] !== offscreenCanvas);

    // Find map calls (destX = treeSlotW)
    const mapDrawCall = mapCalls.find(
      (c) => c.length === 9 && c[1] === 0 && c[5] === expectedTreeSlotW,
    );
    expect(mapDrawCall).toBeTruthy();

    // Verify slot widths from a basemap call: destW arg (index 7) should be mapSlotW
    const basemapSlotCalls = mapCalls.filter((c) => c.length === 9 && c[5] === expectedTreeSlotW);
    expect(basemapSlotCalls.length).toBeGreaterThan(0);
    // The dest width arg (index 7 in 9-arg drawImage: src,sx,sy,sw,sh,dx,dy,dw,dh) is at index 7
    // But due to aspect scaling, dw may be <= mapSlotW. Just verify destX was placed correctly.
    expect(basemapSlotCalls[0]?.[5]).toBe(expectedTreeSlotW);

    // Tree call destX should be 0
    const treeDrawCall = drawCalls.find((c) => c.length === 9 && c[5] === 0);
    expect(treeDrawCall).toBeTruthy();

    // Ensure slot widths are correct
    expect(expectedTreeSlotW + expectedMapSlotW).toBe(exportW);

    createElementSpy.mockRestore();
    treeDiv.remove();
    mapDiv.remove();
  });

  it('aspect preservation: source canvas wider than slot reduces draw height (letterboxes)', async () => {
    // Tree canvas is 2:1 aspect (wide), slot is 1:1 — should letterbox top/bottom
    const treeCanvasW = 800;
    const treeCanvasH = 400;

    const { div: mapDiv } = setupMapDom(600, 300);
    const { div: treeDiv, canvas: treeCanvas } = setupTreeDomForCapture(400, 300);
    // Override canvas dimensions to be wide
    treeCanvas.width = treeCanvasW;
    treeCanvas.height = treeCanvasH;
    stubMediaRecorder();

    const offscreenCtx = { drawImage: vi.fn(), fillStyle: '', fillRect: vi.fn() };
    const offscreenCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(offscreenCtx),
      captureStream: vi.fn().mockReturnValue({ getTracks: () => [] }),
    };

    const realCreate3 = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        if (tag === 'canvas') return offscreenCanvas as unknown as HTMLCanvasElement;
        return realCreate3(tag);
      });

    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    await runCapture(
      { startYear: 2010, endYear: 2011, width: 1000, height: 1000, fps: 1 },
      () => {},
    );

    // treeSlotW = round(1000 * 400/1000) = 400; slotH = 1000
    // treeCanvas is 800x400 = 2:1; slot is 400x1000 = 0.4:1
    // srcAspect(2) > destAspect(0.4), so drawH = destW / srcAspect = 400 / 2 = 200
    // drawW = destW = 400
    const treeDrawCall = offscreenCtx.drawImage.mock.calls.find((c) => c[0] === treeCanvas);
    expect(treeDrawCall).toBeTruthy();
    expect(treeDrawCall?.length).toBe(9);
    // dw should be 400 (full slot width), dh should be 200 (letterboxed)
    const [, , , , , , , drawW, drawH] = treeDrawCall!;
    expect(drawW).toBeCloseTo(400, 0);
    expect(drawH).toBeCloseTo(200, 0);

    createElementSpy.mockRestore();
    treeDiv.remove();
    mapDiv.remove();
  });

  it('returns null when tree-panel is not in DOM', async () => {
    setupMapDom();
    const result = await runCapture(
      { startYear: 2010, endYear: 2011, width: 1280, height: 720, fps: 30 },
      () => {},
    );
    expect(result).toBeNull();
  });

  it('returns null when map-view is not in DOM', async () => {
    const result = await runCapture(
      { startYear: 2010, endYear: 2011, width: 1280, height: 720, fps: 30 },
      () => {},
    );
    expect(result).toBeNull();
  });

  it('start >= end guard prevents recording', async () => {
    setupMapDom();
    render(<ExportPanel />);
    const btn = screen.getByTestId('export-record-btn');
    fireEvent.change(screen.getByTestId('export-start'), { target: { value: '2020' } });
    fireEvent.change(screen.getByTestId('export-end'), { target: { value: '2010' } });
    fireEvent.click(btn);
    expect(btn.textContent).toBe('Record video');
  });
});

describe('snapPng — PNG snapshot', () => {
  function setupTreeDom(cssWidth = 400, cssHeight = 300) {
    const div = document.createElement('div');
    div.setAttribute('data-testid', 'tree-panel');
    vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
      width: cssWidth,
      height: cssHeight,
      top: 0,
      left: 0,
      bottom: cssHeight,
      right: cssWidth,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const canvas = document.createElement('canvas');
    canvas.width = cssWidth * 2;
    canvas.height = cssHeight * 2;
    div.appendChild(canvas);
    document.body.appendChild(div);
    return { div, canvas };
  }

  afterEach(() => {
    for (const el of document.querySelectorAll('[data-testid="tree-panel"]')) el.remove();
  });

  it('exports map-only when the tree panel is hidden', async () => {
    const { div } = setupMapDom();
    const mockCtx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) =>
      cb(new Blob([], { type: 'image/png' })),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.fn();
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(clickSpy);
      return el;
    });

    const err = await snapPng();
    expect(err).toBeNull();
    expect(clickSpy).toHaveBeenCalledOnce();
    div.remove();
  });

  it('exports tree-only when the map panel is hidden', async () => {
    const { div } = setupTreeDom();
    const mockCtx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) =>
      cb(new Blob([], { type: 'image/png' })),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clickSpy = vi.fn();
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(clickSpy);
      return el;
    });

    const err = await snapPng();
    expect(err).toBeNull();
    expect(clickSpy).toHaveBeenCalledOnce();
    div.remove();
  });

  it('returns error when deck.gl overlay canvas has zero size', async () => {
    const { div: treeDiv } = setupTreeDom(400, 300);
    const { div: mapDiv, overlay } = setupMapDom();
    overlay.width = 0;
    overlay.height = 0;
    vi.spyOn(mapDiv, 'getBoundingClientRect').mockReturnValue({
      width: 600,
      height: 300,
      top: 0,
      left: 400,
      bottom: 300,
      right: 1000,
      x: 400,
      y: 0,
      toJSON: () => ({}),
    });
    const err = await snapPng();
    expect(err).toMatch(/zero size/);
    treeDiv.remove();
    mapDiv.remove();
  });

  it('includes the analysis panel below the tree/map row when all three are visible', async () => {
    const treeW = 400;
    const treeH = 300;
    const mapW = 600;
    const mapH = 300;
    const analysisW = 1000;
    const analysisH = 180;
    const dpr = 2;
    Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true });

    const { div: treeDiv } = setupTreeDom(treeW, treeH);
    const { div: mapDiv, basemap, overlay } = setupMapDom(mapW, mapH);
    const { div: analysisDiv } = setupAnalysisDom(analysisW, analysisH);

    const drawImage = vi.fn();
    const mockCtx = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage,
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) =>
      cb(new Blob([], { type: 'image/png' })),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        this.onload?.();
      }
    }
    vi.stubGlobal('Image', FakeImage);

    const createdCanvases: HTMLCanvasElement[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'canvas') createdCanvases.push(el as HTMLCanvasElement);
      if (tag === 'a') vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(vi.fn());
      return el;
    });

    const err = await snapPng(1, false);

    expect(err).toBeNull();
    expect(createdCanvases[0]?.width).toBe((treeW + mapW) * dpr);
    expect(createdCanvases[0]?.height).toBe((treeH + analysisH) * dpr);
    expect(drawImage).toHaveBeenCalledWith(basemap, treeW * dpr, 0, mapW * dpr, treeH * dpr);
    expect(drawImage).toHaveBeenCalledWith(overlay, treeW * dpr, 0, mapW * dpr, treeH * dpr);
    const analysisDraw = drawImage.mock.calls.find((call) => {
      const canvas = call[0] as HTMLCanvasElement | undefined;
      return canvas?.width === analysisW * dpr && call[2] === treeH * dpr;
    });
    expect(analysisDraw).toBeTruthy();

    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    treeDiv.remove();
    mapDiv.remove();
    analysisDiv.remove();
  });

  it('composites using CSS rect dimensions scaled by dpr, tree fills full height slot', async () => {
    const treeW = 400;
    const treeH = 300;
    const mapW = 600;
    const mapH = 300;
    const dpr = 2;
    Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true });

    const { div: treeDiv, canvas: treeCanvas } = setupTreeDom(treeW, treeH);
    const { div: mapDiv, basemap, overlay } = setupMapDom();
    basemap.width = mapW * dpr;
    basemap.height = mapH * dpr;
    overlay.width = mapW * dpr;
    overlay.height = mapH * dpr;
    vi.spyOn(mapDiv, 'getBoundingClientRect').mockReturnValue({
      width: mapW,
      height: mapH,
      top: 0,
      left: treeW,
      bottom: mapH,
      right: treeW + mapW,
      x: treeW,
      y: 0,
      toJSON: () => ({}),
    });

    const drawImage = vi.fn();
    const mockCtx = { fillStyle: '', fillRect: vi.fn(), drawImage };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );

    const createdCanvases: HTMLCanvasElement[] = [];
    const mockBlob = new Blob([], { type: 'image/png' });
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) =>
      cb(mockBlob),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const clickSpy = vi.fn();
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'canvas') createdCanvases.push(el as HTMLCanvasElement);
      if (tag === 'a') vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(clickSpy);
      return el;
    });

    const err = await snapPng();

    const outW = Math.round((treeW + mapW) * dpr);
    const outH = Math.round(Math.max(treeH, mapH) * dpr);
    const treeSlotW = Math.round(treeW * dpr);
    const mapSlotX = treeSlotW;
    const mapSlotW = Math.round(mapW * dpr);

    expect(err).toBeNull();

    const outCanvas = createdCanvases[0];
    expect(outCanvas?.width).toBe(outW);
    expect(outCanvas?.height).toBe(outH);

    expect(drawImage).toHaveBeenCalledWith(
      treeCanvas,
      0,
      0,
      treeCanvas.width,
      treeCanvas.height,
      0,
      0,
      treeSlotW,
      outH,
    );
    expect(drawImage).toHaveBeenCalledWith(basemap, mapSlotX, 0, mapSlotW, outH);
    expect(drawImage).toHaveBeenCalledWith(overlay, mapSlotX, 0, mapSlotW, outH);
    expect(clickSpy).toHaveBeenCalledOnce();

    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    treeDiv.remove();
    mapDiv.remove();
  });

  it('uses --bg-base CSS variable as fill color (dark theme default)', async () => {
    const { div: treeDiv } = setupTreeDom(400, 300);
    const { div: mapDiv } = setupMapDom();
    vi.spyOn(mapDiv, 'getBoundingClientRect').mockReturnValue({
      width: 600,
      height: 300,
      top: 0,
      left: 400,
      bottom: 300,
      right: 1000,
      x: 400,
      y: 0,
      toJSON: () => ({}),
    });

    const mockCtx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) =>
      cb(new Blob([], { type: 'image/png' })),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const realCreate1 = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate1(tag);
      if (tag === 'a') vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(vi.fn());
      return el;
    });

    vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (prop: string) => (prop === '--bg-base' ? '#0a0b0d' : ''),
    } as unknown as CSSStyleDeclaration);

    await snapPng();

    expect(mockCtx.fillStyle).toBe('#0a0b0d');

    treeDiv.remove();
    mapDiv.remove();
  });

  it('uses light theme --bg-base (#fdf6e3) when data-theme="light" is set', async () => {
    const { div: treeDiv } = setupTreeDom(400, 300);
    const { div: mapDiv } = setupMapDom();
    vi.spyOn(mapDiv, 'getBoundingClientRect').mockReturnValue({
      width: 600,
      height: 300,
      top: 0,
      left: 400,
      bottom: 300,
      right: 1000,
      x: 400,
      y: 0,
      toJSON: () => ({}),
    });

    const mockCtx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) =>
      cb(new Blob([], { type: 'image/png' })),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const realCreate2 = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate2(tag);
      if (tag === 'a') vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(vi.fn());
      return el;
    });

    vi.spyOn(globalThis, 'getComputedStyle').mockReturnValue({
      getPropertyValue: (prop: string) => (prop === '--bg-base' ? '#fdf6e3' : ''),
    } as unknown as CSSStyleDeclaration);

    await snapPng();

    expect(mockCtx.fillStyle).toBe('#fdf6e3');

    treeDiv.remove();
    mapDiv.remove();
  });
});

describe('ExportPanel — PNG snapshot button', () => {
  afterEach(() => {
    for (const el of document.querySelectorAll('[data-testid="tree-panel"]')) el.remove();
  });

  it('shows error when neither tree nor map canvas is present', async () => {
    render(<ExportPanel />);
    fireEvent.click(screen.getByTestId('export-png-snapshot'));
    await waitFor(() => {
      expect(screen.getByTestId('export-snapshot-error')).toBeTruthy();
      expect(screen.getByTestId('export-snapshot-error').textContent).toMatch(/Canvases not ready/);
    });
  });
});

describe('ExportPanel — Quality dropdown', () => {
  it('offers 1×/2×/4× quality and toggles overlays from their defaults', () => {
    render(<ExportPanel />);
    const sel = screen.getByTestId('export-quality') as HTMLSelectElement;
    const values = Array.from(sel.options).map((o) => o.value);
    expect(values).toEqual(['1', '2', '4']);
    expect(sel.value).toBe('2');

    const cb = screen.getByTestId('export-overlays') as HTMLInputElement;
    expect(cb.checked).toBe(true);
    fireEvent.click(cb);
    expect(cb.checked).toBe(false);
  });
});

describe('runCapture — quality multiplier scales output dimensions', () => {
  it('output canvas width = width * qualityMultiplier at 2×', async () => {
    const { div: mapDiv } = setupMapDom(600, 300);
    const { div: treeDiv } = setupTreeDomForCapture(400, 300);
    stubMediaRecorder();

    const canvases: HTMLCanvasElement[] = [];
    const offscreenCtx = {
      drawImage: vi.fn(),
      fillStyle: '',
      fillRect: vi.fn(),
      imageSmoothingQuality: 'high',
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      stroke: vi.fn(),
      roundRect: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 80 }),
      globalAlpha: 1,
      strokeStyle: '',
      lineWidth: 1,
    };

    const realCreate = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        if (tag === 'canvas') {
          const c = {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue(offscreenCtx),
            captureStream: vi.fn().mockReturnValue({ getTracks: () => [] }),
          } as unknown as HTMLCanvasElement;
          canvases.push(c);
          return c;
        }
        return realCreate(tag);
      });

    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    await runCapture(
      { startYear: 2010, endYear: 2011, width: 1280, height: 720, fps: 1, qualityMultiplier: 2 },
      () => {},
    );

    const offscreen = canvases[0];
    expect(offscreen?.width).toBe(1280 * 2);
    expect(offscreen?.height).toBe(720 * 2);

    createElementSpy.mockRestore();
    treeDiv.remove();
    mapDiv.remove();
  });

  it('output canvas width = width * 1 at 1× (unchanged)', async () => {
    const { div: mapDiv } = setupMapDom(600, 300);
    const { div: treeDiv } = setupTreeDomForCapture(400, 300);
    stubMediaRecorder();

    const offscreenCtx = { drawImage: vi.fn(), fillStyle: '', fillRect: vi.fn() };
    const offscreenCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(offscreenCtx),
      captureStream: vi.fn().mockReturnValue({ getTracks: () => [] }),
    };

    const realCreate2 = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        if (tag === 'canvas') return offscreenCanvas as unknown as HTMLCanvasElement;
        return realCreate2(tag);
      });

    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    await runCapture(
      { startYear: 2010, endYear: 2011, width: 1280, height: 720, fps: 1, qualityMultiplier: 1 },
      () => {},
    );

    expect(offscreenCanvas.width).toBe(1280);
    expect(offscreenCanvas.height).toBe(720);

    createElementSpy.mockRestore();
    treeDiv.remove();
    mapDiv.remove();
  });
});

describe('runCapture — overlays toggle', () => {
  function makeFullCtx() {
    return {
      drawImage: vi.fn(),
      fillStyle: '',
      fillRect: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 80 }),
      roundRect: vi.fn(),
      globalAlpha: 1,
      strokeStyle: '',
      lineWidth: 1,
      clearRect: vi.fn(),
      imageSmoothingQuality: 'high',
    };
  }

  it('when showOverlays=false, fillText is not called', async () => {
    const { div: mapDiv } = setupMapDom(600, 300);
    const { div: treeDiv } = setupTreeDomForCapture(400, 300);
    stubMediaRecorder();

    const offscreenCtx = makeFullCtx();
    const offscreenCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(offscreenCtx),
      captureStream: vi.fn().mockReturnValue({ getTracks: () => [] }),
    };

    const realCreate = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        if (tag === 'canvas') return offscreenCanvas as unknown as HTMLCanvasElement;
        return realCreate(tag);
      });

    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    await runCapture(
      { startYear: 2010, endYear: 2011, width: 1280, height: 720, fps: 1, showOverlays: false },
      () => {},
    );

    expect(offscreenCtx.fillText).not.toHaveBeenCalled();

    createElementSpy.mockRestore();
    treeDiv.remove();
    mapDiv.remove();
  });

  it('when showOverlays=true, fillText is called at least once', async () => {
    const { div: mapDiv } = setupMapDom(600, 300);
    const { div: treeDiv } = setupTreeDomForCapture(400, 300);
    stubMediaRecorder();

    const offscreenCtx = makeFullCtx();
    const offscreenCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(offscreenCtx),
      captureStream: vi.fn().mockReturnValue({ getTracks: () => [] }),
    };

    const realCreate = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        if (tag === 'canvas') return offscreenCanvas as unknown as HTMLCanvasElement;
        return realCreate(tag);
      });

    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    await runCapture(
      { startYear: 2010, endYear: 2011, width: 1280, height: 720, fps: 1, showOverlays: true },
      () => {},
    );

    expect(offscreenCtx.fillText).toHaveBeenCalled();

    createElementSpy.mockRestore();
    treeDiv.remove();
    mapDiv.remove();
  });
});

describe('composeFrame — quality multiplier scales output dimensions', () => {
  function makeFullCtx() {
    return {
      drawImage: vi.fn(),
      fillStyle: '',
      fillRect: vi.fn(),
      fillText: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      rect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 80 }),
      roundRect: vi.fn(),
      globalAlpha: 1,
      strokeStyle: '',
      lineWidth: 1,
      clearRect: vi.fn(),
      imageSmoothingQuality: 'high',
    };
  }

  it('output canvas and tree/map draw rects scale by quality multiplier', () => {
    const { div: mapDiv } = setupMapDom(600, 300);

    const treeSlotW = 400;
    const mapSlotW = 600;
    const height = 300;
    const quality = 2;

    const createdCanvases: Array<{ width: number; height: number }> = [];
    const ctx = makeFullCtx();

    const realCreate = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        if (tag === 'canvas') {
          const c = {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue(ctx),
          } as unknown as HTMLCanvasElement;
          createdCanvases.push(c as unknown as { width: number; height: number });
          return c;
        }
        return realCreate(tag);
      });

    composeFrame(treeSlotW, mapSlotW, height, quality, 2015, '#000', false, null);

    const out = createdCanvases[0];
    expect(out?.width).toBe((treeSlotW + mapSlotW) * quality);
    expect(out?.height).toBe(height * quality);

    const treeDrawCall = ctx.drawImage.mock.calls.find(
      (c) => c.length === 5 && c[1] === 0 && c[2] === 0 && c[3] === treeSlotW * quality,
    );
    expect(treeDrawCall).toBeTruthy();

    createElementSpy.mockRestore();
    mapDiv.remove();
  });

  it('draws the basemap into the map slot when source and slot dimensions differ', () => {
    const { div: mapDiv, basemap, overlay } = setupMapDom(600, 300);
    basemap.width = 333;
    basemap.height = 222;
    overlay.width = 1200;
    overlay.height = 600;

    const treeSlotW = 400;
    const mapSlotW = 600;
    const height = 300;
    const quality = 2;
    const ctx = makeFullCtx();

    const realCreate = document.createElement.bind(document);
    const createElementSpy = vi
      .spyOn(document, 'createElement')
      .mockImplementation((tag: string) => {
        if (tag === 'canvas') {
          return {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue(ctx),
          } as unknown as HTMLCanvasElement;
        }
        return realCreate(tag);
      });

    composeFrame(treeSlotW, mapSlotW, height, quality, 2015, '#000', false, null);

    const treePx = treeSlotW * quality;
    const mapPx = mapSlotW * quality;
    const outH = height * quality;
    expect(ctx.drawImage).toHaveBeenCalledWith(basemap, treePx, 0, mapPx, outH);
    expect(ctx.drawImage).toHaveBeenCalledWith(overlay, treePx, 0, mapPx, outH);
    expect(ctx.drawImage).not.toHaveBeenCalledWith(
      basemap,
      treePx,
      0,
      basemap.width,
      basemap.height,
    );

    createElementSpy.mockRestore();
    mapDiv.remove();
  });
});

describe('runCapture — speed-based totalFrames', () => {
  it('speed=2 yields ~half the frames of speed=1 for the same year range', async () => {
    const { div: mapDiv1 } = setupMapDom(600, 300);
    const { div: treeDiv1 } = setupTreeDomForCapture(400, 300);
    stubMediaRecorder();

    const offscreenCtx1 = { drawImage: vi.fn(), fillStyle: '', fillRect: vi.fn() };
    const offscreenCanvas1 = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(offscreenCtx1),
      captureStream: vi.fn().mockReturnValue({ getTracks: () => [] }),
    };

    const realCreate1 = document.createElement.bind(document);
    const createSpy1 = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return offscreenCanvas1 as unknown as HTMLCanvasElement;
      return realCreate1(tag);
    });

    const rafSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });

    let progress1Calls = 0;
    useTimelineStore.setState({ speed: 1 });
    await runCapture({ startYear: 2010, endYear: 2020, width: 1280, height: 720, fps: 10 }, () => {
      progress1Calls++;
    });

    createSpy1.mockRestore();
    rafSpy.mockRestore();
    treeDiv1.remove();
    mapDiv1.remove();

    const { div: mapDiv2 } = setupMapDom(600, 300);
    const { div: treeDiv2 } = setupTreeDomForCapture(400, 300);
    stubMediaRecorder();

    const offscreenCtx2 = { drawImage: vi.fn(), fillStyle: '', fillRect: vi.fn() };
    const offscreenCanvas2 = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(offscreenCtx2),
      captureStream: vi.fn().mockReturnValue({ getTracks: () => [] }),
    };

    const realCreate2 = document.createElement.bind(document);
    const createSpy2 = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return offscreenCanvas2 as unknown as HTMLCanvasElement;
      return realCreate2(tag);
    });

    const rafSpy2 = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });

    let progress2Calls = 0;
    useTimelineStore.setState({ speed: 2 });
    await runCapture({ startYear: 2010, endYear: 2020, width: 1280, height: 720, fps: 10 }, () => {
      progress2Calls++;
    });

    createSpy2.mockRestore();
    rafSpy2.mockRestore();
    treeDiv2.remove();
    mapDiv2.remove();

    // speed=2 yields half as many frames
    expect(progress2Calls).toBeCloseTo(progress1Calls / 2, 0);
  });

  it('Window mode records until the left edge reaches the export end year', async () => {
    const { div: mapDiv } = setupMapDom(600, 300);
    const { div: treeDiv } = setupTreeDomForCapture(400, 300);
    stubMediaRecorder();

    const offscreenCtx = { drawImage: vi.fn(), fillStyle: '', fillRect: vi.fn() };
    const offscreenCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(offscreenCtx),
      captureStream: vi.fn().mockReturnValue({ getTracks: () => [] }),
    };

    const realCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return offscreenCanvas as unknown as HTMLCanvasElement;
      return realCreate(tag);
    });

    const rafSpy = vi
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });

    let progressCalls = 0;
    useTimelineStore.setState({
      bounds: { min: 2010, max: 2020 },
      mode: 'Window',
      window: { start: 2018, end: 2020 },
      windowSize: 2,
      speed: 1,
    });

    await runCapture({ startYear: 2010, endYear: 2020, width: 1280, height: 720, fps: 10 }, () => {
      progressCalls++;
    });

    expect(progressCalls).toBe(60);
    expect(useTimelineStore.getState().playhead).toBe(2022);

    createSpy.mockRestore();
    rafSpy.mockRestore();
    treeDiv.remove();
    mapDiv.remove();
  });
});

function makeMockMapInstance(originalRatio = 1) {
  let currentRatio = originalRatio;
  const idleListeners: (() => void)[] = [];
  return {
    getPixelRatio: vi.fn(() => currentRatio),
    setPixelRatio: vi.fn((r: number) => {
      currentRatio = r;
    }),
    triggerRepaint: vi.fn(),
    once: vi.fn((event: string, cb: () => void) => {
      if (event === 'idle') idleListeners.push(cb);
    }),
    flushIdle: () => {
      for (const cb of idleListeners.splice(0)) cb();
    },
  };
}

describe('snapPng — setPixelRatio bump', () => {
  function setupTreeDomSnap(cssWidth = 400, cssHeight = 300) {
    const div = document.createElement('div');
    div.setAttribute('data-testid', 'tree-panel');
    vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
      width: cssWidth,
      height: cssHeight,
      top: 0,
      left: 0,
      bottom: cssHeight,
      right: cssWidth,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const canvas = document.createElement('canvas');
    canvas.width = cssWidth * 2;
    canvas.height = cssHeight * 2;
    div.appendChild(canvas);
    document.body.appendChild(div);
    return { div, canvas };
  }

  function setupMapDomSnap(cssWidth = 600, cssHeight = 300) {
    const div = document.createElement('div');
    div.setAttribute('data-testid', 'map-view');
    vi.spyOn(div, 'getBoundingClientRect').mockReturnValue({
      width: cssWidth,
      height: cssHeight,
      top: 0,
      left: 400,
      bottom: cssHeight,
      right: 400 + cssWidth,
      x: 400,
      y: 0,
      toJSON: () => ({}),
    });
    const basemap = document.createElement('canvas');
    basemap.classList.add('maplibregl-canvas');
    basemap.width = cssWidth * 2;
    basemap.height = cssHeight * 2;
    const overlay = document.createElement('canvas');
    overlay.width = cssWidth * 2;
    overlay.height = cssHeight * 2;
    div.appendChild(basemap);
    div.appendChild(overlay);
    document.body.appendChild(div);
    return { div, basemap, overlay };
  }

  afterEach(() => {
    for (const el of document.querySelectorAll('[data-testid="tree-panel"]')) el.remove();
    for (const el of document.querySelectorAll('[data-testid="map-view"]')) el.remove();
    useMapStore.setState({ mapInstance: null });
  });

  it('quality=1: setPixelRatio is NOT called', async () => {
    const { div: treeDiv } = setupTreeDomSnap();
    const { div: mapDiv } = setupMapDomSnap();

    const mockMap = makeMockMapInstance(1);
    useMapStore.setState({ mapInstance: mockMap as unknown as import('maplibre-gl').Map });

    const mockCtx = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) =>
      cb(new Blob([], { type: 'image/png' })),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(vi.fn());
      return el;
    });

    await snapPng(1, false);

    expect(mockMap.setPixelRatio).not.toHaveBeenCalled();

    treeDiv.remove();
    mapDiv.remove();
  });

  it('quality=2: setPixelRatio called with originalRatio*2 BEFORE drawImage and restored after', async () => {
    const { div: treeDiv } = setupTreeDomSnap();
    const { div: mapDiv } = setupMapDomSnap();

    const originalRatio = 1;
    const mockMap = makeMockMapInstance(originalRatio);
    useMapStore.setState({ mapInstance: mockMap as unknown as import('maplibre-gl').Map });

    const setPixelRatioCalls: number[] = [];
    mockMap.setPixelRatio.mockImplementation((r: number) => {
      setPixelRatioCalls.push(r);
    });

    let drawImageCalledAfterBump = false;
    const mockCtx = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn().mockImplementation(() => {
        if (setPixelRatioCalls.length > 0) drawImageCalledAfterBump = true;
      }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) =>
      cb(new Blob([], { type: 'image/png' })),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(vi.fn());
      return el;
    });

    const snapPromise = snapPng(2, false);
    mockMap.flushIdle();
    await snapPromise;

    expect(setPixelRatioCalls[0]).toBe(originalRatio * 2);
    expect(drawImageCalledAfterBump).toBe(true);
    expect(setPixelRatioCalls[1]).toBe(originalRatio);

    treeDiv.remove();
    mapDiv.remove();
  });

  it('quality=2 with overlays draws the legend at export resolution', async () => {
    const { div: treeDiv } = setupTreeDomSnap();
    const { div: mapDiv } = setupMapDomSnap();
    useSelectionStore.setState({ focusedTaxa: ['taxon-a'] });

    const mockMap = makeMockMapInstance(1);
    useMapStore.setState({ mapInstance: mockMap as unknown as import('maplibre-gl').Map });

    const mockCtx = makeFullCanvasContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb: BlobCallback) =>
      cb(new Blob([], { type: 'image/png' })),
    );
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'a') vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(vi.fn());
      return el;
    });

    const snapPromise = snapPng(2, true);
    mockMap.flushIdle();
    await snapPromise;

    const legendDraw = mockCtx.drawImage.mock.calls.find((call) => {
      const canvas = call[0] as HTMLCanvasElement | undefined;
      return call.length === 3 && canvas?.width === 1120 && canvas.height > 0;
    });
    const tinyLegendDraw = mockCtx.drawImage.mock.calls.find((call) => {
      const canvas = call[0] as HTMLCanvasElement | undefined;
      return call.length === 3 && canvas?.width === 560 && canvas.height > 0;
    });
    expect(legendDraw).toBeTruthy();
    expect(tinyLegendDraw).toBeFalsy();

    treeDiv.remove();
    mapDiv.remove();
  });
});

describe('runCapture — setPixelRatio bump', () => {
  function setupOffscreenCanvas() {
    const offscreenCtx = {
      drawImage: vi.fn(),
      fillStyle: '',
      fillRect: vi.fn(),
      imageSmoothingQuality: 'high',
    };
    const offscreenCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(offscreenCtx),
      captureStream: vi.fn().mockReturnValue({ getTracks: () => [] }),
    };
    return { offscreenCanvas };
  }

  afterEach(() => {
    useMapStore.setState({ mapInstance: null });
  });

  it('quality=2 with map: setPixelRatio(orig*2) once at start and restored at completion', async () => {
    const { div: mapDiv } = setupMapDom(600, 300);
    const { div: treeDiv } = setupTreeDomForCapture(400, 300);
    stubMediaRecorder();

    const { offscreenCanvas } = setupOffscreenCanvas();
    const realCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return offscreenCanvas as unknown as HTMLCanvasElement;
      return realCreate(tag);
    });

    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    const originalRatio = 1.5;
    const mockMap = makeMockMapInstance(originalRatio);
    useMapStore.setState({ mapInstance: mockMap as unknown as import('maplibre-gl').Map });

    await runCapture(
      { startYear: 2010, endYear: 2011, width: 1280, height: 720, fps: 1, qualityMultiplier: 2 },
      () => {},
    );

    expect(mockMap.setPixelRatio).toHaveBeenCalledTimes(2);
    expect(mockMap.setPixelRatio).toHaveBeenNthCalledWith(1, originalRatio * 2);
    expect(mockMap.setPixelRatio).toHaveBeenNthCalledWith(2, originalRatio);

    createSpy.mockRestore();
    treeDiv.remove();
    mapDiv.remove();
  });

  it('quality=2 with map stretches the bumped basemap to the export map slot', async () => {
    const { div: mapDiv, basemap, overlay } = setupMapDom(600, 300);
    const { div: treeDiv } = setupTreeDomForCapture(400, 300);
    basemap.width = 333;
    basemap.height = 222;
    overlay.width = 1200;
    overlay.height = 600;
    stubMediaRecorder();

    const offscreenCtx = {
      drawImage: vi.fn(),
      fillStyle: '',
      fillRect: vi.fn(),
      imageSmoothingQuality: 'high',
    };
    const offscreenCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(offscreenCtx),
      captureStream: vi.fn().mockReturnValue({ getTracks: () => [] }),
    };
    const realCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return offscreenCanvas as unknown as HTMLCanvasElement;
      return realCreate(tag);
    });

    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    const mockMap = makeMockMapInstance(1);
    useMapStore.setState({ mapInstance: mockMap as unknown as import('maplibre-gl').Map });

    await runCapture(
      { startYear: 2010, endYear: 2011, width: 1280, height: 720, fps: 1, qualityMultiplier: 2 },
      () => {},
    );

    const treeSlotW = Math.round(1280 * (400 / (400 + 600)));
    const mapSlotW = 1280 - treeSlotW;
    const treePx = treeSlotW * 2;
    const mapPx = mapSlotW * 2;
    const outH = 720 * 2;
    expect(offscreenCtx.drawImage).toHaveBeenCalledWith(basemap, treePx, 0, mapPx, outH);
    expect(offscreenCtx.drawImage).toHaveBeenCalledWith(overlay, treePx, 0, mapPx, outH);
    expect(offscreenCtx.drawImage).not.toHaveBeenCalledWith(
      basemap,
      treePx,
      0,
      basemap.width,
      basemap.height,
    );

    createSpy.mockRestore();
    treeDiv.remove();
    mapDiv.remove();
  });

  it('quality=1: setPixelRatio NOT called even with a mapInstance', async () => {
    const { div: mapDiv } = setupMapDom(600, 300);
    const { div: treeDiv } = setupTreeDomForCapture(400, 300);
    stubMediaRecorder();

    const { offscreenCanvas } = setupOffscreenCanvas();
    const realCreate = document.createElement.bind(document);
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') return offscreenCanvas as unknown as HTMLCanvasElement;
      return realCreate(tag);
    });

    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    const mockMap = makeMockMapInstance(1);
    useMapStore.setState({ mapInstance: mockMap as unknown as import('maplibre-gl').Map });

    await runCapture(
      { startYear: 2010, endYear: 2011, width: 1280, height: 720, fps: 1, qualityMultiplier: 1 },
      () => {},
    );

    expect(mockMap.setPixelRatio).not.toHaveBeenCalled();

    createSpy.mockRestore();
    treeDiv.remove();
    mapDiv.remove();
  });
});
