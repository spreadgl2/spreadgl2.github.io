import { MapView as DeckMapView, type Layer, OrthographicView } from '@deck.gl/core';
import { DeckGL } from '@deck.gl/react';
import { ArrowDownNarrowWide, ArrowUpNarrowWide, Home, ScanSearch } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTreeStore } from '../../store/tree';
import type { TreeSortOrder, VisibleViews } from '../../store/ui';
import { EnvLegendOverlay } from '../map-view/EnvLegendOverlay';
import { LassoTool } from '../map-view/LassoTool';
import { MapLibreBasemap } from '../map-view/MapLibreBasemap';
import { useMapDeckModel } from '../map-view/useMapDeckModel';
import { useAutoFadeControls } from '../tree-view/useAutoFadeControls';
import { useTreeGlDeckModel } from '../tree-view/useTreeGlDeckModel';
import { Inspector } from './Inspector';
import styles from './UnifiedDeckViewer.module.css';

const MAP_VIEW_ID = 'map';
const TREE_VIEW_ID = 'tree';
const SPLITTER_WIDTH = 4;
const DeckMapViewSlot = DeckMapView as unknown as React.ComponentType<{
  id: string;
  children: React.ReactNode;
}>;

interface UnifiedDeckSurfaceProps {
  contentRowRef: React.MutableRefObject<HTMLDivElement | null>;
  treeSplitFraction: number;
  onSplitterMouseDown: (e: React.MouseEvent) => void;
  visibleViews: VisibleViews;
}

interface SurfaceDims {
  width: number;
  height: number;
}

function withUnifiedView(layer: Layer, prefix: string, viewId: string): Layer {
  return layer.clone({ id: `${prefix}:${layer.id}`, viewId } as Partial<Layer['props']>);
}

function layerViewId(layer: Layer): string | null {
  const propsViewId = (layer.props as Layer['props'] & { viewId?: string }).viewId;
  if (propsViewId) return propsViewId;
  if (layer.id.startsWith('tree:')) return TREE_VIEW_ID;
  if (layer.id.startsWith('map:')) return MAP_VIEW_ID;
  return null;
}

interface TreeSortToolbarProps {
  order: TreeSortOrder;
  onChange: (order: TreeSortOrder) => void;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  verticalSpacing: number;
  onResetZoom: () => void;
  canResetZoom: boolean;
}

function TreeSortToolbar({
  order,
  onChange,
  focusMode,
  onToggleFocusMode,
  verticalSpacing,
  onResetZoom,
  canResetZoom,
}: TreeSortToolbarProps) {
  const { faded, autoFadeHandlers } = useAutoFadeControls(2000);
  const baseButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    background: 'var(--surface-raised, rgba(255,255,255,0.06))',
    color: 'var(--text-secondary, #aaa)',
    border: '1px solid var(--border, rgba(255,255,255,0.1))',
    borderRadius: 4,
    cursor: 'pointer',
    padding: 0,
  };
  const activeButtonStyle: React.CSSProperties = {
    background: 'var(--accent, #1e90ff)',
    color: 'var(--fg-on-accent, #fff)',
    border: '1px solid var(--accent, #1e90ff)',
  };
  const disabledButtonStyle: React.CSSProperties = {
    opacity: 0.45,
    cursor: 'not-allowed',
  };
  const sortButtonStyle = (buttonOrder: TreeSortOrder): React.CSSProperties =>
    order === buttonOrder ? { ...baseButtonStyle, ...activeButtonStyle } : baseButtonStyle;
  const dividerStyle: React.CSSProperties = {
    width: 1,
    height: 18,
    margin: '5px 2px',
    background: 'var(--border, rgba(255,255,255,0.14))',
  };

  return (
    <div
      role="toolbar"
      aria-label="Tree controls"
      data-testid="tree-sort-toolbar"
      data-tree-control-root="true"
      className={styles.treeSortToolbar}
      style={{ opacity: faded && !focusMode ? 0.2 : 1, zIndex: 20 }}
      {...autoFadeHandlers}
    >
      <button
        type="button"
        title="Ladderize descending (large clades on top)"
        aria-pressed={order === 'desc'}
        onClick={() => onChange('desc')}
        style={sortButtonStyle('desc')}
      >
        <ArrowDownNarrowWide size={14} />
      </button>
      <button
        type="button"
        title="Ladderize ascending (small clades on top)"
        aria-pressed={order === 'asc'}
        onClick={() => onChange('asc')}
        style={sortButtonStyle('asc')}
      >
        <ArrowUpNarrowWide size={14} />
      </button>
      <span aria-hidden="true" style={dividerStyle} />
      <button
        type="button"
        title={
          focusMode
            ? 'Exit tree focus mode'
            : `Tree focus: drag to zoom; Up/Down adjust spacing (${Number.parseFloat(
                verticalSpacing.toFixed(2),
              )}x)`
        }
        aria-label="Tree focus mode"
        aria-pressed={focusMode}
        data-testid="tree-focus-toggle"
        onClick={onToggleFocusMode}
        style={focusMode ? { ...baseButtonStyle, ...activeButtonStyle } : baseButtonStyle}
      >
        <ScanSearch size={14} />
      </button>
      <button
        type="button"
        title="Reset tree view"
        aria-label="Reset tree view"
        data-testid="tree-zoom-reset"
        disabled={!canResetZoom}
        onClick={onResetZoom}
        style={canResetZoom ? baseButtonStyle : { ...baseButtonStyle, ...disabledButtonStyle }}
      >
        <Home size={14} />
      </button>
    </div>
  );
}

function TreeZoomBoxOverlay({
  rect,
}: {
  rect: { left: number; top: number; width: number; height: number };
}) {
  return (
    <div
      aria-hidden="true"
      data-testid="tree-zoom-box"
      style={{
        position: 'absolute',
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        border: '1px solid var(--accent, #1e90ff)',
        background: 'rgba(30, 144, 255, 0.16)',
        boxShadow: '0 0 0 1px rgb(30 144 255 / 24%) inset',
        pointerEvents: 'none',
        zIndex: 15,
      }}
    />
  );
}

export function UnifiedDeckSurface({
  contentRowRef,
  treeSplitFraction,
  onSplitterMouseDown,
  visibleViews,
}: UnifiedDeckSurfaceProps) {
  const [contentEl, setContentEl] = useState<HTMLDivElement | null>(null);
  const [dims, setDims] = useState<SurfaceDims>({ width: 0, height: 0 });
  const datasetKey = useTreeStore((s) => {
    const source = s.exampleId ?? s.fileName ?? 'none';
    const graphCount = s.graph?.nodes.length ?? 0;
    const layoutCount = s.layout?.nodes.length ?? 0;
    const branchCount = s.branchTable?.count ?? 0;
    return `${source}:${graphCount}:${layoutCount}:${branchCount}`;
  });
  const mapModel = useMapDeckModel();
  const treeModel = useTreeGlDeckModel();

  useEffect(() => {
    if (!contentEl) return;
    const update = () => setDims({ width: contentEl.clientWidth, height: contentEl.clientHeight });
    update();
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setDims({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    ro.observe(contentEl);
    return () => ro.disconnect();
  }, [contentEl]);

  const geometry = useMemo(() => {
    const showTree = visibleViews.tree;
    const showMap = visibleViews.map;
    const splitterWidth = showTree && showMap ? SPLITTER_WIDTH : 0;
    const treeWidth = showTree ? Math.round(dims.width * (showMap ? treeSplitFraction : 1)) : 0;
    const mapX = showTree ? treeWidth + splitterWidth : 0;
    return {
      treeWidth,
      mapX,
      mapWidth: showMap ? Math.max(0, dims.width - mapX) : 0,
      height: dims.height,
      splitterWidth,
    };
  }, [dims, treeSplitFraction, visibleViews]);
  const deckWidth = Math.max(1, Math.floor(dims.width));
  const deckHeight = Math.max(1, Math.floor(dims.height));
  const hasDeckSize = dims.width > 0 && dims.height > 0;

  const views = useMemo(() => {
    const next = [];
    if (visibleViews.tree) {
      next.push(
        new OrthographicView({
          id: TREE_VIEW_ID,
          x: 0,
          y: 0,
          width: geometry.treeWidth,
          height: geometry.height,
          flipY: true,
          controller: false,
        }),
      );
    }
    if (visibleViews.map) {
      next.push(
        new DeckMapView({
          id: MAP_VIEW_ID,
          x: geometry.mapX,
          y: 0,
          width: geometry.mapWidth,
          height: geometry.height,
          controller: mapModel.deckProps.controller,
        }),
      );
    }
    return next;
  }, [geometry, mapModel.deckProps.controller, visibleViews]);

  const initialViewState = useMemo(
    () => ({
      ...(visibleViews.tree ? { [TREE_VIEW_ID]: treeModel.deckProps.initialViewState } : {}),
      ...(visibleViews.map ? { [MAP_VIEW_ID]: mapModel.deckProps.initialViewState } : {}),
    }),
    [mapModel.deckProps.initialViewState, treeModel.deckProps.initialViewState, visibleViews],
  );

  const layers = useMemo(
    () => [
      ...(visibleViews.tree
        ? treeModel.deckProps.layers.map((layer) =>
            withUnifiedView(layer as Layer, 'tree', TREE_VIEW_ID),
          )
        : []),
      ...(visibleViews.map
        ? mapModel.deckProps.layers.map((layer) =>
            withUnifiedView(layer as Layer, 'map', MAP_VIEW_ID),
          )
        : []),
    ],
    [mapModel.deckProps.layers, treeModel.deckProps.layers, visibleViews],
  );

  const handleViewStateChange = useCallback(
    (e: { viewId?: string; viewState: unknown; interactionState?: { isPanning?: boolean } }) => {
      if (e.viewId && e.viewId !== MAP_VIEW_ID) return;
      mapModel.deckProps.onViewStateChange(e);
    },
    [mapModel.deckProps],
  );

  const layerFilter = useCallback(
    ({ layer, viewport }: { layer: Layer; viewport: { id: string } }) =>
      layerViewId(layer) === viewport.id,
    [],
  );

  const setRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      setContentEl(node);
      contentRowRef.current = node;
    },
    [contentRowRef],
  );

  const setDeckSurfaceRef = useCallback(
    (node: HTMLDivElement | null) => {
      mapModel.wheelTargetRef.current = node;
    },
    [mapModel.wheelTargetRef],
  );

  return (
    <div ref={setRootRef} className={styles.contentRow} data-testid="content-row">
      {visibleViews.tree && (
        <div
          data-testid="tree-panel"
          className={styles.treePanel}
          style={{ ...treeModel.rootProps.style, width: geometry.treeWidth }}
        />
      )}

      {visibleViews.tree && visibleViews.map && (
        <button
          type="button"
          aria-label="Drag to resize tree and map panels"
          data-testid="splitter"
          className={styles.splitter}
          onMouseDown={onSplitterMouseDown}
        />
      )}

      {visibleViews.map && (
        <section
          ref={mapModel.containerRef}
          aria-label={mapModel.sectionProps['aria-label']}
          data-testid="map-panel"
          className={styles.mapPanel}
        />
      )}

      {/* biome-ignore lint/a11y/noStaticElementInteractions: map interactions are mirrored from the DeckGL canvas wrapper */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: map keyboard shortcuts are handled globally by timeline/viewer controls */}
      <div
        ref={setDeckSurfaceRef}
        className={styles.deckSurface}
        onMouseMove={visibleViews.map ? mapModel.sectionProps.onMouseMove : undefined}
        onMouseLeave={visibleViews.map ? mapModel.sectionProps.onMouseLeave : undefined}
        onClick={visibleViews.map ? mapModel.sectionProps.onClick : undefined}
      >
        {hasDeckSize && views.length > 0 && (
          <DeckGL
            id="unified-deck"
            key={`${datasetKey}:${mapModel.deckProps.key}`}
            width={deckWidth}
            height={deckHeight}
            views={views}
            initialViewState={initialViewState}
            layers={layers}
            layerFilter={layerFilter}
            onViewStateChange={handleViewStateChange}
            useDevicePixels={mapModel.deckProps.useDevicePixels}
            style={mapModel.deckProps.style}
          >
            {visibleViews.map && (
              <DeckMapViewSlot id={MAP_VIEW_ID}>
                <MapLibreBasemap
                  mapRef={mapModel.mapRef}
                  mapStyle={mapModel.mapProps.mapStyle}
                  canvasContextAttributes={mapModel.mapProps.canvasContextAttributes}
                  onLoad={mapModel.mapProps.onLoad}
                  viewState={mapModel.deckProps.initialViewState}
                />
              </DeckMapViewSlot>
            )}
          </DeckGL>
        )}
      </div>

      {visibleViews.tree && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: tree keyboard navigation is handled outside this P3 route
        <div
          ref={treeModel.containerRef}
          role="img"
          aria-label={treeModel.rootProps['aria-label']}
          className={styles.treeOverlay}
          style={{
            width: geometry.treeWidth,
            cursor: treeModel.rootProps.style.cursor,
            userSelect: treeModel.rootProps.style.userSelect,
          }}
          onMouseDown={treeModel.rootProps.onMouseDown}
          onMouseMove={treeModel.rootProps.onMouseMove}
          onMouseUp={treeModel.rootProps.onMouseUp}
          onWheel={treeModel.rootProps.onWheel}
          onMouseLeave={treeModel.rootProps.onMouseLeave}
          onClick={treeModel.rootProps.onClick}
          onDoubleClick={treeModel.rootProps.onDoubleClick}
        >
          <TreeSortToolbar
            order={treeModel.overlays.sortOrder}
            onChange={treeModel.overlays.setSortOrder}
            focusMode={treeModel.overlays.focusMode}
            onToggleFocusMode={treeModel.overlays.toggleFocusMode}
            verticalSpacing={treeModel.overlays.verticalSpacing}
            onResetZoom={treeModel.overlays.resetTreeZoom}
            canResetZoom={treeModel.overlays.canResetZoom}
          />
          {treeModel.overlays.zoomBoxRect && (
            <TreeZoomBoxOverlay rect={treeModel.overlays.zoomBoxRect} />
          )}
          <Inspector source="tree" />
        </div>
      )}

      {visibleViews.map && (
        <div
          className={styles.mapOverlay}
          style={{ left: geometry.mapX, width: geometry.mapWidth }}
        >
          {mapModel.overlays.noGeoData && (
            <div data-testid="map-no-geo-notice" className={styles.noGeoNotice}>
              <div className={styles.noGeoNoticeInner}>
                <div className={styles.noGeoNoticeTitle}>No geographic data in this tree</div>
                This tree has no continuous lat/lon annotations and no discrete location trait, so
                there is nothing to plot on the map. Load a BEAST X tree with geographic
                annotations, or drop a tree that uses a discrete location trait together with a
                location-lookup CSV.
              </div>
            </div>
          )}
          {mapModel.overlays.playheadDateLabel && (
            <span
              aria-live="polite"
              aria-atomic="true"
              data-testid="map-playhead-live"
              className={styles.srOnly}
            >
              {mapModel.overlays.playheadDateLabel}
            </span>
          )}
          {mapModel.overlays.pickLocationName && (
            <div data-testid="map-pick-location-banner" className={styles.pickLocationBanner}>
              Click to set coordinates for "{mapModel.overlays.pickLocationName}" · Esc to cancel
            </div>
          )}
          <Inspector source="map" />
          <EnvLegendOverlay />
          <LassoTool
            branchTable={mapModel.overlays.branchTable}
            graph={mapModel.overlays.graph}
            layout={mapModel.overlays.layout}
          />
          {mapModel.overlays.clusterTooltip && (
            <div
              data-testid="cluster-tooltip"
              className={styles.clusterTooltip}
              style={{
                left: mapModel.overlays.clusterTooltip.x + 14,
                top: mapModel.overlays.clusterTooltip.y + 14,
              }}
            >
              {mapModel.overlays.clusterTooltip.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
