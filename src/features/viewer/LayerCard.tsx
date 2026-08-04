import type { ReactNode } from 'react';
import { type LayerId, useUiStore } from '../../store/ui';
import styles from './LayerCard.module.css';

// A card with a checkbox+title header on top and a body of controls below —
// shared by the Style panel (tree/map render layers) and the Layers panel
// (boundary/region/raster overlays) so every element looks the same.
export function LayerCard({
  title,
  checked,
  onCheckedChange,
  checkboxTestId,
  cardTestId,
  children,
}: {
  title: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  checkboxTestId?: string;
  cardTestId?: string;
  children?: ReactNode;
}) {
  return (
    <div className={styles.card} data-testid={cardTestId}>
      <label className={styles.header}>
        <input
          type="checkbox"
          checked={checked}
          data-testid={checkboxTestId}
          onChange={(e) => onCheckedChange(e.target.checked)}
        />
        <span className={styles.title}>{title}</span>
      </label>
      <div className={styles.body} aria-disabled={!checked}>
        {children}
      </div>
    </div>
  );
}

// A labelled range slider (label + value on one line, track below) for a card body.
export function LayerSlider({
  label,
  displayValue,
  value,
  min,
  max,
  step,
  onChange,
  sliderTestId,
  disabled,
}: {
  label: string;
  displayValue: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  sliderTestId?: string;
  disabled?: boolean;
}) {
  return (
    <>
      <div className={styles.sliderLabel}>
        <span>{label}</span>
        <span className={styles.sliderValue}>{displayValue}</span>
      </div>
      <input
        type="range"
        className={styles.slider}
        data-testid={sliderTestId}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </>
  );
}

// A LayerCard bound to a store layer's visibility + opacity, with an Opacity
// slider in its body. `id` may be a built-in LayerId or a custom overlay id.
export function LayerToggleCard({
  id,
  title,
  children,
}: {
  id: LayerId | string;
  title: string;
  children?: ReactNode;
}) {
  const visible = useUiStore((s) => s.layerVisibility[id] ?? true);
  const opacity = useUiStore((s) => s.layerOpacity[id] ?? 100);
  const setLayerVisibility = useUiStore((s) => s.setLayerVisibility);
  const setLayerOpacity = useUiStore((s) => s.setLayerOpacity);

  return (
    <LayerCard
      title={title}
      checked={visible}
      onCheckedChange={(v) => setLayerVisibility(id, v)}
      checkboxTestId={`layer-toggle-${id}`}
      cardTestId={`layer-card-${id}`}
    >
      <LayerSlider
        label="Opacity"
        displayValue={`${opacity}%`}
        value={opacity}
        min={0}
        max={100}
        step={1}
        onChange={(v) => setLayerOpacity(id, v)}
        sliderTestId={`layer-opacity-${id}`}
        disabled={!visible}
      />
      {children}
    </LayerCard>
  );
}
