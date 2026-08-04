import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import App from '../App';
import { DEFAULT_WINDOW_FRACTION } from '../features/timeline/window-config';
import { useTimelineStore } from '../store/timeline';
import { useTreeStore } from '../store/tree';

const QUERY = new URLSearchParams(window.location.search);
const ANIMATE_MODE = QUERY.get('animate') === '1';
const STRESS_MODE = QUERY.get('mode') === 'window' ? 'Window' : 'Trail';
const STRESS_ARCS = QUERY.get('arcs') !== '0';
const ANIM_SWEEP_SECONDS = 20;
const ANIM_WARMUP_FRAMES = 30;
const MEASURE_MS = 5000;

interface AnimFpsResult {
  animEffectiveFps: number;
  animFrameTimeP50: number;
  animFrameTimeP95: number;
  animFrameTimeP99: number;
  animColdFrameTimeMax: number;
  animSampleCount: number;
  animFpsStatus: 'measuring' | 'done';
}

interface StressMetrics {
  branchTableKb: number;
  tipCount: number;
  branchCount: number;
  dateRange: [number, number];
  fps: number | null;
  fpsStatus: 'measuring' | 'done' | null;
}

function percentile(sorted: number[], quantile: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))] ?? 0;
}

function summarize(
  samplesMs: number[],
  elapsedMs: number,
  coldFrameTimeMax: number,
): Omit<AnimFpsResult, 'animFpsStatus'> {
  const sorted = samplesMs.filter(Number.isFinite).sort((a, b) => a - b);
  return {
    animEffectiveFps: Math.round((sorted.length / elapsedMs) * 1000 * 10) / 10,
    animFrameTimeP50: Math.round(percentile(sorted, 0.5) * 10) / 10,
    animFrameTimeP95: Math.round(percentile(sorted, 0.95) * 10) / 10,
    animFrameTimeP99: Math.round(percentile(sorted, 0.99) * 10) / 10,
    animColdFrameTimeMax: Math.round(coldFrameTimeMax * 10) / 10,
    animSampleCount: sorted.length,
  };
}

function B117StressController() {
  const graph = useTreeStore((s) => s.graph);
  const branchTable = useTreeStore((s) => s.branchTable);
  const parseStatus = useTreeStore((s) => s.parseStatus);
  const bounds = useTimelineStore((s) => s.bounds);
  const playhead = useTimelineStore((s) => s.playhead);
  const setPlayhead = useTimelineStore((s) => s.setPlayhead);
  const setIsPlaying = useTimelineStore((s) => s.setIsPlaying);
  const setMode = useTimelineStore((s) => s.setMode);
  const setWindow = useTimelineStore((s) => s.setWindow);
  const setArcs = useTimelineStore((s) => s.setArcs);
  const setClade = useTimelineStore((s) => s.setClade);
  const [idleFps, setIdleFps] = useState<number | null>(null);
  const [idleStatus, setIdleStatus] = useState<'measuring' | 'done' | null>(null);
  const [animFps, setAnimFps] = useState<AnimFpsResult | null>(null);

  const metrics = useMemo<StressMetrics | null>(() => {
    if (!graph || !branchTable || !bounds) return null;
    const branchTableKb =
      (branchTable.branchId.byteLength +
        branchTable.parentBranch.byteLength +
        branchTable.isInternal.byteLength +
        branchTable.startTime.byteLength +
        branchTable.endTime.byteLength +
        branchTable.startLat.byteLength +
        branchTable.startLon.byteLength +
        branchTable.endLat.byteLength +
        branchTable.endLon.byteLength +
        branchTable.stateWeight.byteLength) /
      1024;
    return {
      branchTableKb,
      tipCount: graph.nodes.filter((n) => n.adjacents.length <= 1).length,
      branchCount: branchTable.count,
      dateRange: [bounds.min, bounds.max],
      fps: idleFps,
      fpsStatus: idleStatus,
    };
  }, [bounds, branchTable, graph, idleFps, idleStatus]);

  useEffect(() => {
    if (!metrics) return;
    (globalThis as Record<string, unknown>).__b117StressMetrics = {
      branchTableKb: metrics.branchTableKb,
      tipCount: metrics.tipCount,
      branchCount: metrics.branchCount,
      dateRange: metrics.dateRange,
    };
  }, [metrics]);

  useEffect(() => {
    if (parseStatus !== 'done' || !bounds || ANIMATE_MODE) return;
    setIdleStatus('measuring');
    let frameCount = 0;
    let rafId = 0;
    const start = performance.now();

    const tick = () => {
      frameCount++;
      const elapsed = performance.now() - start;
      if (elapsed < MEASURE_MS) {
        rafId = requestAnimationFrame(tick);
      } else {
        const fps = Math.round((frameCount / elapsed) * 10000) / 10;
        setIdleFps(fps);
        setIdleStatus('done');
        (globalThis as Record<string, unknown>).__b117StressFps = fps;
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [bounds, parseStatus]);

  useEffect(() => {
    if (parseStatus !== 'done' || !bounds || !ANIMATE_MODE) return;

    setMode(STRESS_MODE);
    setArcs(STRESS_ARCS);
    setClade(false);
    setAnimFps({
      animEffectiveFps: 0,
      animFrameTimeP50: 0,
      animFrameTimeP95: 0,
      animFrameTimeP99: 0,
      animColdFrameTimeMax: 0,
      animSampleCount: 0,
      animFpsStatus: 'measuring',
    });

    const [t0, t1] = [bounds.min, bounds.max];
    const dateSpan = t1 - t0;
    if (STRESS_MODE === 'Window') {
      const w = DEFAULT_WINDOW_FRACTION * dateSpan;
      setWindow({ start: t0 - w, end: t0 });
    } else {
      setWindow(null);
    }
    setPlayhead(t0);
    setIsPlaying(true);

    const msPerSweep = ANIM_SWEEP_SECONDS * 1000;
    let rafId = 0;
    let lastRaf = performance.now();
    const frameDeltasMs: number[] = [];
    let coldFrameTimeMax = 0;
    const animationStart = performance.now();
    let measureStart: number | null = null;
    let warmupFrames = 0;

    const tick = () => {
      const now = performance.now();
      const deltaMs = now - lastRaf;
      lastRaf = now;

      const elapsed = Math.min(now - animationStart, msPerSweep);
      setPlayhead(t0 + (elapsed / msPerSweep) * dateSpan);

      if (deltaMs > 0 && Number.isFinite(deltaMs)) {
        coldFrameTimeMax = Math.max(coldFrameTimeMax, deltaMs);
      }
      if (measureStart === null) {
        warmupFrames += 1;
        if (warmupFrames >= ANIM_WARMUP_FRAMES) {
          measureStart = now;
          lastRaf = now;
        }
        rafId = requestAnimationFrame(tick);
        return;
      }

      if (deltaMs > 0 && Number.isFinite(deltaMs)) {
        frameDeltasMs.push(deltaMs);
      }

      if (now - measureStart < MEASURE_MS) {
        rafId = requestAnimationFrame(tick);
      } else {
        const measuredElapsed = Math.max(1, now - measureStart);
        const result: AnimFpsResult = {
          ...summarize(frameDeltasMs, measuredElapsed, coldFrameTimeMax),
          animFpsStatus: 'done',
        };
        (globalThis as Record<string, unknown>).__b117AnimFps = result;
        setAnimFps(result);
        setIsPlaying(false);
        setPlayhead(t1);
      }
    };

    (globalThis as Record<string, unknown>).__b117AnimFps = {
      animEffectiveFps: 0,
      animFrameTimeP50: 0,
      animFrameTimeP95: 0,
      animFrameTimeP99: 0,
      animColdFrameTimeMax: 0,
      animSampleCount: 0,
      animFpsStatus: 'measuring',
    } satisfies AnimFpsResult;

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      setIsPlaying(false);
    };
  }, [bounds, parseStatus, setArcs, setClade, setIsPlaying, setMode, setPlayhead, setWindow]);

  const panelStyle: CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    background: 'rgba(10, 12, 16, 0.92)',
    color: '#e8eaee',
    fontFamily: 'monospace',
    fontSize: 12,
    padding: '8px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.12)',
    zIndex: 9999,
    display: 'flex',
    gap: 24,
    flexWrap: 'wrap',
    alignItems: 'center',
  };

  return (
    <div style={panelStyle}>
      <span style={{ fontWeight: 700, color: '#5eead4' }}>
        B.1.1.7 unified deck.gl stress{ANIMATE_MODE ? ' [ANIMATION]' : ''}
      </span>
      {ANIMATE_MODE && (
        <span>
          mode: <b>{STRESS_MODE}</b> / layer: <b>{STRESS_ARCS ? 'arcs' : 'trips'}</b>
        </span>
      )}
      {metrics ? (
        <>
          <span>
            BranchTable: <b>{metrics.branchTableKb.toFixed(0)} KB</b>
          </span>
          <span>
            tips: <b>{metrics.tipCount.toLocaleString()}</b>
          </span>
          <span>
            branches: <b>{metrics.branchCount.toLocaleString()}</b>
          </span>
          <span>
            date:{' '}
            <b>
              {metrics.dateRange[0].toFixed(3)} - {metrics.dateRange[1].toFixed(3)}
            </b>
          </span>
          <span>
            playhead: <b>{playhead.toFixed(3)}</b>
          </span>
          {!ANIMATE_MODE && metrics.fpsStatus === 'measuring' && (
            <span>
              fps: <i>measuring 5 s...</i>
            </span>
          )}
          {!ANIMATE_MODE && metrics.fpsStatus === 'done' && (
            <span>
              fps: <b>{metrics.fps}</b>
            </span>
          )}
          {ANIMATE_MODE && animFps?.animFpsStatus === 'measuring' && (
            <span>
              anim-fps: <i>measuring 5 s...</i>
            </span>
          )}
          {ANIMATE_MODE && animFps?.animFpsStatus === 'done' && (
            <span>
              anim-fps: <b data-testid="anim-effective-fps">{animFps.animEffectiveFps} effective</b>
              {' / '}
              <b data-testid="anim-frame-time-p95">{animFps.animFrameTimeP95} ms p95</b>
              {' / '}
              <b data-testid="anim-frame-time-p99">{animFps.animFrameTimeP99} ms p99</b>
            </span>
          )}
        </>
      ) : (
        <span>loading B.1.1.7...</span>
      )}
    </div>
  );
}

export function B117StressPage() {
  return (
    <>
      <App autoLoadExampleId="b117" playbackLoopEnabled={false} />
      <B117StressController />
    </>
  );
}
