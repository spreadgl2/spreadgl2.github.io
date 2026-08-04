import { describe, expect, it } from 'vitest';
import { dimColor } from './TreeViewGL';

// dimColor is a pure colour transform. It lived in TreeViewGL.test.tsx, which
// runs under jsdom with a 280-line deck.gl fixture preamble it does not need.

describe('dimColor', () => {
  it('desaturates toward grey and drops alpha to 5%', () => {
    // Pure red [255,0,0] at full base alpha. grey = 0.299*255 ≈ 76.
    const [r, g, b, a] = dimColor([255, 0, 0, 200], 1);
    // r = 255 + (76-255)*0.85 ≈ 103; g = b = 0 + 76*0.85 ≈ 65
    expect(r).toBe(103);
    expect(g).toBe(65);
    expect(b).toBe(65);
    // Still a faint red tint (not fully grey), but much closer to grey.
    expect(r).toBeGreaterThan(g);
    expect(r - g).toBeLessThan(255); // far less saturated than the original 255 gap
    // Alpha: 200 * 0.05 * 1 = 10.
    expect(a).toBe(10);
  });

  it('scales the dim alpha by the tree-opacity factor', () => {
    // alphaScale 0.5 (tree opacity 50%) → 200 * 0.05 * 0.5 = 5.
    expect(dimColor([255, 0, 0, 200], 0.5)[3]).toBe(5);
  });
});
