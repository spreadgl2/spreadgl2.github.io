export function branchOpacitySliderToLayerOpacity(value: number): number {
  const clamped = Math.max(0, Math.min(100, value));
  return clamped / 400;
}
