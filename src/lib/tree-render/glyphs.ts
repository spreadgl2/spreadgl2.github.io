export const TIP_GLYPHS = ['circle', 'triangle', 'square', 'diamond'] as const;

export type TipGlyph = (typeof TIP_GLYPHS)[number];

export function traceTipGlyphPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  glyph: TipGlyph,
): void {
  switch (glyph) {
    case 'circle':
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      break;
    case 'triangle': {
      const height = radius * 1.732;
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx + height * 0.5, cy + radius * 0.5);
      ctx.lineTo(cx - height * 0.5, cy + radius * 0.5);
      ctx.closePath();
      break;
    }
    case 'square': {
      const halfSide = radius * 1.2;
      ctx.rect(cx - halfSide, cy - halfSide, halfSide * 2, halfSide * 2);
      break;
    }
    case 'diamond':
      ctx.moveTo(cx, cy - radius * 1.4);
      ctx.lineTo(cx + radius, cy);
      ctx.lineTo(cx, cy + radius * 1.4);
      ctx.lineTo(cx - radius, cy);
      ctx.closePath();
      break;
  }
}
