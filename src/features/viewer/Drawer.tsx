import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type TransitionEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { setPreference } from '../../lib/persist/preferences';
import { type ActivePanel, useUiStore } from '../../store/ui';
import { DatesPanel } from './DatesPanel';
import styles from './Drawer.module.css';
import { ExportPanel } from './ExportPanel';
import { FilterPanel } from './FilterPanel';
import { FilterResetButton } from './FilterResetButton';
import { LayersPanel } from './LayersPanel';
import { LocationsPanel } from './LocationsPanel';
import { SettingsPanel } from './SettingsPanel';
import { StylePanel } from './StylePanel';

// Drag bounds for the left-opening drawers (Locations / Dates).
const MIN_LEFT_DRAWER_WIDTH = 300;
const MAX_LEFT_DRAWER_WIDTH = 1000;

export function Drawer() {
  const activePanel = useUiStore((s) => s.activePanel);
  const setActivePanel = useUiStore((s) => s.setActivePanel);
  const datesPanelWidth = useUiStore((s) => s.datesPanelWidth);
  const locationsPanelWidth = useUiStore((s) => s.locationsPanelWidth);
  const setDatesPanelWidth = useUiStore((s) => s.setDatesPanelWidth);
  const setLocationsPanelWidth = useUiStore((s) => s.setLocationsPanelWidth);
  const [renderedPanel, setRenderedPanel] = useState<NonNullable<ActivePanel> | null>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activePanel) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setActivePanel(null);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activePanel, setActivePanel]);

  useEffect(() => {
    if (activePanel) setRenderedPanel(activePanel);
  }, [activePanel]);

  const isOpen = activePanel !== null;
  const currentPanel = activePanel ?? renderedPanel;
  const isLeftPanel = currentPanel === 'locations' || currentPanel === 'dates';
  const isDatesPanel = currentPanel === 'dates';
  const isIdle = currentPanel === null;

  // Drag the right edge of a left-opening drawer to widen it (e.g. to read long
  // taxon names). Width is per-panel and persisted like the tree/analysis splits.
  const leftDrawerWidth = isDatesPanel ? datesPanelWidth : locationsPanelWidth;
  function startResize(e: ReactMouseEvent) {
    e.preventDefault();
    const el = drawerRef.current;
    if (!el) return;
    const left = el.getBoundingClientRect().left;
    const applyWidth = isDatesPanel ? setDatesPanelWidth : setLocationsPanelWidth;
    const prefKey = isDatesPanel ? 'datesPanelWidth' : 'locationsPanelWidth';
    const onMove = (mv: globalThis.MouseEvent) => {
      const availableWidth = window.innerWidth - left - 16;
      const maxWidth = Math.max(220, Math.min(MAX_LEFT_DRAWER_WIDTH, availableWidth));
      const minWidth = Math.min(MIN_LEFT_DRAWER_WIDTH, maxWidth);
      const next = Math.max(minWidth, Math.min(maxWidth, mv.clientX - left));
      applyWidth(next);
      setPreference(prefKey, next);
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  function handleTransitionEnd(e: TransitionEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && !activePanel) {
      setRenderedPanel(null);
    }
  }

  let panelTitle = '';
  switch (currentPanel) {
    case 'style':
      panelTitle = 'Style';
      break;
    case 'layers':
      panelTitle = 'Layers';
      break;
    case 'filter':
      panelTitle = 'Filter';
      break;
    case 'locations':
      panelTitle = 'Locations';
      break;
    case 'dates':
      panelTitle = 'Dates';
      break;
    case 'export':
      panelTitle = 'Export';
      break;
    case 'settings':
      panelTitle = 'Settings';
      break;
  }

  return (
    <div
      ref={drawerRef}
      id="app-drawer"
      data-testid="drawer"
      className={[
        styles.drawer,
        isLeftPanel ? styles.drawerLocations : '',
        isDatesPanel ? styles.drawerDates : '',
        isOpen ? styles.drawerOpen : styles.drawerClosed,
        isIdle ? styles.drawerIdle : '',
      ].join(' ')}
      style={
        isLeftPanel ? ({ '--drawer-width': `${leftDrawerWidth}px` } as CSSProperties) : undefined
      }
      aria-hidden={!isOpen}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className={styles.panelHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.panelTitle}>{panelTitle}</span>
          {currentPanel === 'filter' && <FilterResetButton />}
        </div>
        <button
          type="button"
          className={styles.closeBtn}
          aria-label="Close panel"
          data-testid="drawer-close-btn"
          onClick={() => setActivePanel(null)}
        >
          ✕
        </button>
      </div>

      <div className={[styles.panelBody, isLeftPanel ? styles.panelBodyLocations : ''].join(' ')}>
        {currentPanel === 'style' && <StylePanel />}
        {currentPanel === 'layers' && <LayersPanel />}
        {currentPanel === 'filter' && <FilterPanel />}
        {currentPanel === 'locations' && <LocationsPanel />}
        {currentPanel === 'dates' && <DatesPanel />}
        {currentPanel === 'export' && <ExportPanel />}
        {currentPanel === 'settings' && <SettingsPanel />}
      </div>

      {isLeftPanel && (
        <button
          type="button"
          className={styles.resizeHandle}
          data-testid="drawer-resize-handle"
          aria-label="Resize panel"
          onMouseDown={startResize}
        />
      )}
    </div>
  );
}
