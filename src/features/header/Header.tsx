import {
  ChartLine,
  ExternalLink,
  Filter,
  Layers,
  Map as MapIcon,
  Settings,
  Sliders,
  TreePine,
} from 'lucide-react';
import { useSelectionStore } from '../../store/selection';
import type { ActivePanel } from '../../store/ui';
import { useUiStore } from '../../store/ui';
import { BrandControls } from './BrandControls';
import styles from './Header.module.css';

const HOME_URL = import.meta.env.BASE_URL || '/';

// The single drawer that hosts whichever panel is active; the panel/command
// buttons point their aria-controls at it.
const DRAWER_ID = 'app-drawer';

export function Header() {
  const activePanel = useUiStore((s) => s.activePanel);
  const setActivePanel = useUiStore((s) => s.setActivePanel);
  const visibleViews = useUiStore((s) => s.visibleViews);
  const toggleVisibleView = useUiStore((s) => s.toggleVisibleView);
  const posteriorThreshold = useUiStore((s) => s.posteriorThreshold);
  const lassoMode = useUiStore((s) => s.lassoMode);
  const focusedTaxaCount = useSelectionStore((s) => s.focusedTaxa.length);
  const hasActiveFilters = focusedTaxaCount > 0 || posteriorThreshold > 0 || lassoMode;

  function toggle(panel: NonNullable<ActivePanel>) {
    setActivePanel(activePanel === panel ? null : panel);
  }

  return (
    <header className={styles.header} data-testid="app-header">
      <a
        className={styles.brand}
        href={HOME_URL}
        aria-label="SpreadGL2 home"
        data-testid="header-brand-link"
      >
        SpreadGL2
      </a>
      <BrandControls />

      <div className={styles.spacer} />

      <div className={styles.headerActions} data-testid="header-icon-row">
        {/* Persistent workspace views — segmented toggles. A filled segment
            means "this view is visible" (not "a panel is open"). */}
        {/* biome-ignore lint/a11y/useSemanticElements: a labelled control group, not a form fieldset */}
        <div
          className={styles.viewGroup}
          role="group"
          aria-label="Workspace views"
          data-testid="header-view-group"
        >
          <button
            type="button"
            aria-label="Tree"
            aria-pressed={visibleViews.tree}
            title="Tree"
            data-testid="header-toggle-tree"
            className={[styles.viewBtn, visibleViews.tree ? styles.viewBtnActive : ''].join(' ')}
            onClick={() => toggleVisibleView('tree')}
          >
            <TreePine size={16} />
            <span className={styles.viewLabel}>Tree</span>
          </button>
          <button
            type="button"
            aria-label="Map"
            aria-pressed={visibleViews.map}
            title="Map"
            data-testid="header-toggle-map"
            className={[styles.viewBtn, visibleViews.map ? styles.viewBtnActive : ''].join(' ')}
            onClick={() => toggleVisibleView('map')}
          >
            <MapIcon size={16} />
            <span className={styles.viewLabel}>Map</span>
          </button>
          <button
            type="button"
            aria-label="Analysis"
            aria-pressed={visibleViews.analysis}
            title="Analysis"
            data-testid="header-toggle-analysis"
            className={[styles.viewBtn, visibleViews.analysis ? styles.viewBtnActive : ''].join(
              ' ',
            )}
            onClick={() => toggleVisibleView('analysis')}
          >
            <ChartLine size={16} />
            <span className={styles.viewLabel}>Analysis</span>
          </button>
        </div>

        <span className={styles.divider} aria-hidden="true" />

        {/* An underline marks the open drawer; amber + dot marks an active filter. */}
        {/* biome-ignore lint/a11y/useSemanticElements: a labelled control group, not a form fieldset */}
        <div className={styles.panelGroup} role="group" aria-label="Panels">
          <button
            type="button"
            aria-label="Style"
            title="Style"
            aria-expanded={activePanel === 'style'}
            aria-controls={DRAWER_ID}
            data-testid="header-btn-style"
            className={[styles.panelBtn, activePanel === 'style' ? styles.panelBtnOpen : ''].join(
              ' ',
            )}
            onClick={() => toggle('style')}
          >
            <Sliders size={16} />
          </button>
          <button
            type="button"
            aria-label="Layers"
            title="Layers"
            aria-expanded={activePanel === 'layers'}
            aria-controls={DRAWER_ID}
            data-testid="header-btn-layers"
            className={[styles.panelBtn, activePanel === 'layers' ? styles.panelBtnOpen : ''].join(
              ' ',
            )}
            onClick={() => toggle('layers')}
          >
            <Layers size={16} />
          </button>
          <button
            type="button"
            aria-label={hasActiveFilters ? 'Filter active' : 'Filter'}
            title={hasActiveFilters ? 'Filter active' : 'Filter'}
            aria-expanded={activePanel === 'filter'}
            aria-controls={DRAWER_ID}
            data-testid="header-btn-filter"
            className={[
              styles.panelBtn,
              activePanel === 'filter' ? styles.panelBtnOpen : '',
              hasActiveFilters ? styles.panelBtnFiltered : '',
            ].join(' ')}
            onClick={() => toggle('filter')}
          >
            <Filter size={16} />
            {hasActiveFilters && <span className={styles.filterDot} aria-hidden="true" />}
          </button>
        </div>

        <span className={styles.divider} aria-hidden="true" />

        {/* Commands — higher-consequence Export (labelled chip) and the global
            Settings icon, kept apart from the view/panel controls. */}
        {/* biome-ignore lint/a11y/useSemanticElements: a labelled control group, not a form fieldset */}
        <div className={styles.commands} role="group" aria-label="Actions">
          <button
            type="button"
            aria-label="Export"
            title="Export"
            aria-expanded={activePanel === 'export'}
            aria-controls={DRAWER_ID}
            data-testid="header-btn-export"
            className={[
              styles.exportChip,
              activePanel === 'export' ? styles.exportChipActive : '',
            ].join(' ')}
            onClick={() => toggle('export')}
          >
            <ExternalLink size={12} />
            Export
          </button>
          <button
            type="button"
            aria-label="Settings"
            title="Settings"
            aria-expanded={activePanel === 'settings'}
            aria-controls={DRAWER_ID}
            data-testid="header-btn-settings"
            className={[
              styles.panelBtn,
              activePanel === 'settings' ? styles.panelBtnOpen : '',
            ].join(' ')}
            onClick={() => toggle('settings')}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
