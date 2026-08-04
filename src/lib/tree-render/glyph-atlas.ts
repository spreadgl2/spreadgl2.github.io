import { TIP_GLYPHS, type TipGlyph, traceTipGlyphPath } from './glyphs.js';

export const ATLAS_CELL = 64;
export const ATLAS_GLYPHS: readonly TipGlyph[] = TIP_GLYPHS;

export interface GlyphAtlas {
  iconAtlas: string;
  iconMapping: Record<
    TipGlyph,
    { x: number; y: number; width: number; height: number; mask: boolean }
  >;
}

export function buildGlyphAtlas(): GlyphAtlas {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_CELL * ATLAS_GLYPHS.length;
  canvas.height = ATLAS_CELL;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d unavailable');
  ctx.fillStyle = '#ffffff';
  const r = ATLAS_CELL * 0.36;
  const iconMapping = {} as GlyphAtlas['iconMapping'];
  for (let i = 0; i < ATLAS_GLYPHS.length; i++) {
    const glyph = ATLAS_GLYPHS[i] as TipGlyph;
    ctx.beginPath();
    traceTipGlyphPath(ctx, ATLAS_CELL * i + ATLAS_CELL / 2, ATLAS_CELL / 2, r, glyph);
    ctx.fill();
    iconMapping[glyph] = {
      x: ATLAS_CELL * i,
      y: 0,
      width: ATLAS_CELL,
      height: ATLAS_CELL,
      mask: true,
    };
  }
  return { iconAtlas: canvas.toDataURL(), iconMapping };
}
