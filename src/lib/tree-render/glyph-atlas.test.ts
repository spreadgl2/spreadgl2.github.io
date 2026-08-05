// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATLAS_CELL, ATLAS_GLYPHS, buildGlyphAtlas } from './glyph-atlas';

describe('buildGlyphAtlas', () => {
  let mockCtx: {
    fillStyle: string;
    beginPath: ReturnType<typeof vi.fn>;
    arc: ReturnType<typeof vi.fn>;
    moveTo: ReturnType<typeof vi.fn>;
    lineTo: ReturnType<typeof vi.fn>;
    rect: ReturnType<typeof vi.fn>;
    closePath: ReturnType<typeof vi.fn>;
    fill: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockCtx = {
      fillStyle: '',
      beginPath: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      rect: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the canvas as a deck.gl texture source', () => {
    const atlas = buildGlyphAtlas();
    expect(atlas.iconAtlas).toBeInstanceOf(HTMLCanvasElement);
    expect((atlas.iconAtlas as HTMLCanvasElement).width).toBe(ATLAS_CELL * ATLAS_GLYPHS.length);
    expect((atlas.iconAtlas as HTMLCanvasElement).height).toBe(ATLAS_CELL);
  });

  it('iconMapping has an entry for all 4 glyph shapes', () => {
    const atlas = buildGlyphAtlas();
    expect(Object.keys(atlas.iconMapping)).toHaveLength(4);
    for (const glyph of ATLAS_GLYPHS) {
      expect(atlas.iconMapping[glyph]).toBeDefined();
    }
  });

  it('iconMapping x offsets are ATLAS_CELL-spaced starting at 0', () => {
    const atlas = buildGlyphAtlas();
    expect(atlas.iconMapping.circle.x).toBe(0);
    expect(atlas.iconMapping.triangle.x).toBe(ATLAS_CELL);
    expect(atlas.iconMapping.square.x).toBe(ATLAS_CELL * 2);
    expect(atlas.iconMapping.diamond.x).toBe(ATLAS_CELL * 3);
  });

  it('every iconMapping entry has mask: true', () => {
    const atlas = buildGlyphAtlas();
    for (const glyph of ATLAS_GLYPHS) {
      expect(atlas.iconMapping[glyph].mask).toBe(true);
    }
  });

  it('calls beginPath and fill once per glyph (4 times each)', () => {
    buildGlyphAtlas();
    expect(mockCtx.beginPath).toHaveBeenCalledTimes(4);
    expect(mockCtx.fill).toHaveBeenCalledTimes(4);
  });

  it('calls ctx.arc exactly once (for the circle glyph)', () => {
    buildGlyphAtlas();
    expect(mockCtx.arc).toHaveBeenCalledTimes(1);
  });

  it('calls ctx.rect exactly once (for the square glyph)', () => {
    buildGlyphAtlas();
    expect(mockCtx.rect).toHaveBeenCalledTimes(1);
  });
});
