import * as Comlink from 'comlink';
import { ChevronRight, FileUp, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FixtureMeta, FixturesManifest } from '../../lib/format/fixture-meta';
import { detectLookupCSV } from '../../lib/format/lookup-csv';
import { openFilePicker } from '../../lib/native-dialog';
import {
  extractEmbeddedTree,
  type ProjectFile,
  ProjectFileError,
  parseProjectFile,
} from '../../lib/persist/project';
import { applyEmbeddedData } from '../../lib/persist/project-embed';
import {
  assertInputSize,
  type InputKind,
  inputKindForFileName,
} from '../../lib/security/input-limits';
import { useTreeStore } from '../../store/tree';
import { useUiStore } from '../../store/ui';
import type { ParserWorkerApi } from '../../workers/parser.worker';
import { decodeParseError, type ParseStage } from '../../workers/parser-pipeline';
import type { WireParseResult } from '../../workers/wire';
import { rehydrate } from '../../workers/wire';
import { useModalAccessibility } from '../modal/useModalAccessibility';
import { ErrorPanel } from './ErrorPanel';
import { ERROR_COPY, type ParseErrorCode } from './error-copy';
import { ImportSettingsModal, type ImportSettingsSelection } from './ImportSettingsModal';
import { LandingHeader } from './LandingHeader';
import { LandingPage } from './LandingPage';
import styles from './Loader.module.css';
import { MrsdModal } from './MrsdModal';
import { StatusBar } from './StatusBar';

function useParserWorker() {
  const workerRef = useRef<Worker | null>(null);
  const apiRef = useRef<Comlink.Remote<ParserWorkerApi> | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL('../../workers/parser.worker.ts', import.meta.url), {
      type: 'module',
    });
    const api = Comlink.wrap<ParserWorkerApi>(worker);
    workerRef.current = worker;
    apiRef.current = api;
    return () => {
      worker.terminate();
    };
  }, []);

  return apiRef;
}

/**
 * Pending boundary GeoJSON fetched alongside an example's tree, but not yet
 * pushed into the customOverlays store. App.tsx receives this on `onParsed`
 * and filters it down to the analysis area (via the parsed branchTable's
 * bbox) before adding the overlay — so we don't render every country in
 * the world for a tree that only covers one region.
 */
export interface PendingBoundary {
  id: string;
  name: string;
  geojson: import('geojson').FeatureCollection;
}

export interface PendingEnvironment {
  id: string;
  name: string;
  text: string;
}

export interface ParsedOpts {
  pendingBoundary?: PendingBoundary | null;
  pendingEnvironment?: PendingEnvironment | null;
  replacementSource?: ReplacementSource;
}

export interface ReplacementSource {
  fileName: string | null;
  exampleId: string | null;
  rawTreeText: string | null;
  confirmedTraitKey: string | null;
  confirmedTipDatePattern: string | null;
  multiTreeCount: number;
  prefetchedLookup: Map<string, [number, number]> | null;
  projectFile: ProjectFile | null;
}

function publicAssetPath(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${cleanBase}${path.replace(/^\/+/, '')}`;
}

const TIP_COUNT_FORMATTER = new Intl.NumberFormat('en-US');

function exampleYears(dateSpan: [number, number]): string {
  return `${Math.floor(dateSpan[0])}\u2013${Math.floor(dateSpan[1])}`;
}

interface LoaderProps {
  onParsed: (result: ReturnType<typeof rehydrate>, opts?: ParsedOpts) => void | Promise<void>;
  onPrefetchedLookup?: (mapping: Map<string, [number, number]> | null) => void;
  autoLoadExampleId?: string | null;
  autoLoadFile?: { path: string; text: string } | null;
  autoLoadError?: string | null;
  onProjectFileDrop?: (file: ProjectFile) => void;
  overlayOnly?: boolean;
  replacement?: boolean;
  onCancel?: () => void;
  onImportHandoffStart?: () => void;
  onImportHandoffComplete?: () => void;
  onAutoLoadErrorDismiss?: () => void;
}

interface PendingImport {
  wire: WireParseResult;
  opts: ParsedOpts | undefined;
  inputText: string | null;
  getArrayBuffer: (() => Promise<ArrayBuffer>) | null;
  manualMrsdIso: string | undefined;
  confirmedTraitKey: string | undefined;
  confirmedCoordinateKeys: string | undefined;
  confirmedAnalysisKind: 'continuous' | 'discrete' | undefined;
  confirmedHpdKeys: string | null | undefined;
}

function currentHpdKeys(wire: WireParseResult): string | undefined {
  if (wire.traitInfo.kind !== 'continuous') return undefined;
  const latHpd = `${wire.traitInfo.keyFamily.lat}_95%_HPD`;
  const lonHpd = `${wire.traitInfo.keyFamily.lon}_95%_HPD`;
  const internalIds = new Set(
    wire.layout.nodes.filter((node) => !node.isTip).map((node) => node.id),
  );
  for (const node of wire.graph.nodes) {
    if (!internalIds.has(node.origId)) continue;
    if (Array.isArray(node.annotations[latHpd]) && Array.isArray(node.annotations[lonHpd])) {
      return `${latHpd}|${lonHpd}`;
    }
  }
  return undefined;
}

function discreteValuesForWire(wire: WireParseResult, traitKey: string): string[] {
  const tipIds = new Set(wire.layout.nodes.filter((node) => node.isTip).map((node) => node.id));
  const values = new Set<string>();
  for (const node of wire.graph.nodes) {
    if (!tipIds.has(node.origId)) continue;
    const value = node.annotations[traitKey];
    if (typeof value === 'string') values.add(value);
  }
  return [...values].sort();
}

function withDiscreteTrait(wire: WireParseResult, traitKey: string): WireParseResult {
  const candidateValues =
    wire.traitInfo.kind === 'discrete-ambiguous'
      ? wire.traitInfo.candidates.find((candidate) => candidate.key === traitKey)?.values
      : wire.traitInfo.kind === 'discrete' && wire.traitInfo.key === traitKey
        ? wire.traitInfo.values
        : undefined;
  return {
    ...wire,
    traitInfo: {
      kind: 'discrete',
      key: traitKey,
      values: candidateValues ?? discreteValuesForWire(wire, traitKey),
      ambiguous: false,
    },
  };
}

export function Loader({
  onParsed,
  onPrefetchedLookup,
  autoLoadExampleId,
  autoLoadFile,
  autoLoadError,
  onProjectFileDrop,
  overlayOnly = false,
  replacement = false,
  onCancel,
  onImportHandoffStart,
  onImportHandoffComplete,
  onAutoLoadErrorDismiss,
}: LoaderProps) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<ParseErrorCode | null>(null);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [replacementStage, setReplacementStage] = useState<ParseStage | null>(null);
  const [replacementProgress, setReplacementProgress] = useState(0);
  const [examples, setExamples] = useState<FixtureMeta[]>([]);
  const [needsMrsd, setNeedsMrsd] = useState(false);
  const [pendingMrsdText, setPendingMrsdText] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [handoffImport, setHandoffImport] = useState<PendingImport | null>(null);
  const apiRef = useParserWorker();
  const setParseStatus = useTreeStore((s) => s.setParseStatus);
  const setParseProgress = useTreeStore((s) => s.setParseProgress);
  const setFileName = useTreeStore((s) => s.setFileName);
  const setExampleId = useTreeStore((s) => s.setExampleId);
  const setRawTreeText = useTreeStore((s) => s.setRawTreeText);
  const setConfirmedTraitKey = useTreeStore((s) => s.setConfirmedTraitKey);
  const setConfirmedTipDatePattern = useTreeStore((s) => s.setConfirmedTipDatePattern);
  const setMultiTreeCount = useUiStore((s) => s.setMultiTreeCount);
  const autoLoadTriggeredRef = useRef(false);
  const autoLoadFileKeyRef = useRef<string | null>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const importReturnFocusRef = useRef<HTMLElement | null>(null);
  // Boundary GeoJSON fetched alongside the picked example, waiting to be
  // forwarded to App on the next onParsed call so App can filter + add it.
  const pendingBoundaryRef = useRef<PendingBoundary | null>(null);
  const pendingEnvironmentRef = useRef<PendingEnvironment | null>(null);
  // When the Tauri native-FS path is used, we keep a getter to re-read the
  // file for re-parse after trait/tip-date confirmation (avoids holding the
  // full string in memory for the common case where no confirmation is needed).
  const pendingGetArrayBufferRef = useRef<(() => Promise<ArrayBuffer>) | null>(null);
  const pendingMrsdIsoRef = useRef<string | undefined>(undefined);
  const replacementSourceRef = useRef<ReplacementSource>({
    fileName: null,
    exampleId: null,
    rawTreeText: null,
    confirmedTraitKey: null,
    confirmedTipDatePattern: null,
    multiTreeCount: 1,
    prefetchedLookup: null,
    projectFile: null,
  });
  // Set by handleImportConfirm before a re-parse that applies already-confirmed
  // import settings (MRSD / coordinates / analysis kind / HPD). The re-parse
  // result must go straight to onParsed instead of reopening the settings modal
  // (otherwise the user has to click Continue a second time).
  const autoAcceptReparseRef = useRef(false);
  const confirmedImportRef = useRef<PendingImport | null>(null);
  const cancelImportHandoffRef = useRef<(() => void) | null>(null);

  const setLoaderParseStatus = useCallback(
    (status: Parameters<typeof setParseStatus>[0], error?: string) => {
      if (!replacement) setParseStatus(status, error);
    },
    [replacement, setParseStatus],
  );

  const setLoaderParseProgress = useCallback(
    (stage: ParseStage, percent: number) => {
      if (replacement) {
        setReplacementStage(stage);
        setReplacementProgress(percent);
      } else {
        setParseProgress(stage, percent);
      }
    },
    [replacement, setParseProgress],
  );

  const prepareSource = useCallback(
    (
      fileName: string,
      exampleId: string | null,
      projectFile: ProjectFile | null = null,
      confirmedTraitKey: string | null = null,
      confirmedTipDatePattern: string | null = null,
    ) => {
      if (replacement) {
        replacementSourceRef.current = {
          fileName,
          exampleId,
          rawTreeText: null,
          confirmedTraitKey,
          confirmedTipDatePattern,
          multiTreeCount: 1,
          prefetchedLookup: null,
          projectFile,
        };
        return;
      }
      setFileName(fileName);
      setExampleId(exampleId);
      setConfirmedTraitKey(confirmedTraitKey);
      setConfirmedTipDatePattern(confirmedTipDatePattern);
      if (projectFile) onProjectFileDrop?.(projectFile);
    },
    [
      onProjectFileDrop,
      replacement,
      setConfirmedTipDatePattern,
      setConfirmedTraitKey,
      setExampleId,
      setFileName,
    ],
  );

  const recordRawTreeText = useCallback(
    (rawTreeText: string | null) => {
      if (replacement) replacementSourceRef.current.rawTreeText = rawTreeText;
      else setRawTreeText(rawTreeText);
    },
    [replacement, setRawTreeText],
  );

  const recordConfirmedTraitKey = useCallback(
    (confirmedTraitKey: string | null) => {
      if (replacement) replacementSourceRef.current.confirmedTraitKey = confirmedTraitKey;
      else setConfirmedTraitKey(confirmedTraitKey);
    },
    [replacement, setConfirmedTraitKey],
  );

  const recordMultiTreeCount = useCallback(
    (multiTreeCount: number) => {
      if (replacement) replacementSourceRef.current.multiTreeCount = multiTreeCount;
      else setMultiTreeCount(multiTreeCount);
    },
    [replacement, setMultiTreeCount],
  );

  const finishImportHandoff = useCallback(() => {
    cancelImportHandoffRef.current = null;
    confirmedImportRef.current = null;
    pendingGetArrayBufferRef.current = null;
    setPendingImport(null);
    setHandoffImport(null);
    onImportHandoffComplete?.();
  }, [onImportHandoffComplete]);

  const scheduleImportHandoffFinish = useCallback(() => {
    cancelImportHandoffRef.current?.();
    if (typeof requestAnimationFrame !== 'function') {
      const timeoutId = globalThis.setTimeout(finishImportHandoff, 0);
      cancelImportHandoffRef.current = () => globalThis.clearTimeout(timeoutId);
      return;
    }

    let secondFrame: number | null = null;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(finishImportHandoff);
    });
    cancelImportHandoffRef.current = () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) cancelAnimationFrame(secondFrame);
    };
  }, [finishImportHandoff]);

  const deliverParsed = useCallback(
    (
      result: ReturnType<typeof rehydrate>,
      opts: ParsedOpts | undefined,
      retainedImport: PendingImport | null,
    ) => {
      if (!onImportHandoffStart || retainedImport === null) {
        pendingGetArrayBufferRef.current = null;
        confirmedImportRef.current = null;
        setPendingImport(null);
        setHandoffImport(null);
        const parsedOpts = replacement
          ? { ...opts, replacementSource: { ...replacementSourceRef.current } }
          : opts;
        void onParsed(result, parsedOpts);
        return;
      }

      setHandoffImport(retainedImport);
      onImportHandoffStart();
      const parsedOpts = replacement
        ? { ...opts, replacementSource: { ...replacementSourceRef.current } }
        : opts;
      void Promise.resolve(onParsed(result, parsedOpts)).then(
        scheduleImportHandoffFinish,
        scheduleImportHandoffFinish,
      );
    },
    [onImportHandoffStart, onParsed, replacement, scheduleImportHandoffFinish],
  );

  useEffect(() => {
    return () => {
      cancelImportHandoffRef.current?.();
      cancelImportHandoffRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (autoLoadError) setError(autoLoadError);
  }, [autoLoadError]);

  useEffect(() => {
    fetch(publicAssetPath('examples/examples.json'))
      .then((r) => r.json())
      .then((manifest: FixturesManifest) => setExamples(manifest.examples))
      .catch(() => {});
  }, []);

  const handleTryAgain = useCallback(() => {
    setError(null);
    setErrorCode(null);
    setLoaderParseStatus('idle');
    onAutoLoadErrorDismiss?.();
  }, [onAutoLoadErrorDismiss, setLoaderParseStatus]);

  const parseInput = useCallback(
    async (
      input: string | ArrayBuffer,
      confirmedTraitKey?: string,
      confirmedTipDatePattern?: string,
      manualMrsdIso?: string,
      confirmedCoordinateKeys?: string,
      confirmedAnalysisKind?: 'continuous' | 'discrete',
      confirmedHpdKeys?: string | null,
    ) => {
      const api = apiRef.current;
      if (!api) return;
      setLoading(true);
      setError(null);
      setErrorCode(null);
      setLoaderParseStatus('parsing');
      if (replacement) {
        setReplacementStage(null);
        setReplacementProgress(0);
      }
      const isBuffer = input instanceof ArrayBuffer;
      recordRawTreeText(isBuffer ? null : input);
      try {
        const workerInput = isBuffer ? Comlink.transfer(input, [input]) : input;
        const wire = await api.parseWithProgress(
          workerInput,
          Comlink.proxy((stage: ParseStage, percent: number) => {
            setLoaderParseProgress(stage, percent);
          }),
          confirmedTraitKey,
          confirmedTipDatePattern,
          manualMrsdIso,
          confirmedCoordinateKeys,
          confirmedAnalysisKind,
          confirmedHpdKeys,
        );
        pendingMrsdIsoRef.current = undefined;
        recordMultiTreeCount(wire.multiTreeCount ?? 1);
        const pendingBoundary = pendingBoundaryRef.current;
        pendingBoundaryRef.current = null;
        const pendingEnvironment = pendingEnvironmentRef.current;
        pendingEnvironmentRef.current = null;
        const opts =
          pendingBoundary || pendingEnvironment
            ? { pendingBoundary, pendingEnvironment }
            : undefined;

        // Re-parse to apply already-confirmed settings: don't reopen the modal.
        // onParsed (App.handleParsed) sets parseStatus to 'done', which swaps
        // the loader for the viewer — so we must NOT set it back to 'idle' here.
        if (autoAcceptReparseRef.current) {
          autoAcceptReparseRef.current = false;
          deliverParsed(rehydrate(wire), opts, confirmedImportRef.current);
          return;
        }

        setPendingImport({
          wire,
          opts,
          inputText: isBuffer ? null : input,
          getArrayBuffer: isBuffer ? pendingGetArrayBufferRef.current : null,
          manualMrsdIso,
          confirmedTraitKey,
          confirmedCoordinateKeys,
          confirmedAnalysisKind,
          confirmedHpdKeys,
        });
        setLoaderParseStatus('idle');
      } catch (e) {
        autoAcceptReparseRef.current = false;
        const msg = e instanceof Error ? e.message : String(e);
        const code = decodeParseError(msg);
        if (code !== null) {
          if (code === 'needs_mrsd') {
            if (!isBuffer) setPendingMrsdText(input);
            setNeedsMrsd(true);
            setLoaderParseStatus('idle');
            return;
          } else {
            setErrorCode(code);
          }
        } else {
          setError(msg);
        }
        setLoaderParseStatus('error', msg);
      } finally {
        setLoading(false);
      }
    },
    [
      apiRef,
      deliverParsed,
      recordMultiTreeCount,
      recordRawTreeText,
      replacement,
      setLoaderParseProgress,
      setLoaderParseStatus,
    ],
  );

  const parseText = useCallback(
    (
      text: string,
      confirmedTraitKey?: string,
      confirmedTipDatePattern?: string,
      manualMrsdIso?: string,
      confirmedCoordinateKeys?: string,
      confirmedAnalysisKind?: 'continuous' | 'discrete',
      confirmedHpdKeys?: string | null,
    ) =>
      parseInput(
        text,
        confirmedTraitKey,
        confirmedTipDatePattern,
        manualMrsdIso,
        confirmedCoordinateKeys,
        confirmedAnalysisKind,
        confirmedHpdKeys,
      ),
    [parseInput],
  );

  const handleMrsdConfirm = useCallback(
    (mrsdIso: string | null) => {
      setNeedsMrsd(false);
      if (mrsdIso === null) {
        pendingGetArrayBufferRef.current = null;
        pendingMrsdIsoRef.current = undefined;
        setPendingMrsdText(null);
        setLoaderParseStatus('idle');
        return;
      }
      pendingMrsdIsoRef.current = mrsdIso;
      const getBuffer = pendingGetArrayBufferRef.current;
      if (getBuffer !== null) {
        void getBuffer().then((buf) => parseInput(buf, undefined, undefined, mrsdIso));
      } else if (pendingMrsdText !== null) {
        void parseText(pendingMrsdText, undefined, undefined, mrsdIso);
        setPendingMrsdText(null);
      }
    },
    [parseInput, parseText, pendingMrsdText, setLoaderParseStatus],
  );

  const handleImportConfirm = useCallback(
    (selection: ImportSettingsSelection) => {
      if (pendingImport === null) return;
      confirmedImportRef.current = pendingImport;
      const selectedAnalysisKind = selection.analysisKind;
      const selectedTraitKey = selection.traitKey;
      const selectedCoordinateKeys = selection.coordinateKeys;
      const selectedHpdKeys = selection.hpdKeys;
      const currentAnalysisKind =
        pendingImport.wire.traitInfo.kind === 'continuous'
          ? 'continuous'
          : pendingImport.wire.traitInfo.kind === 'discrete' ||
              pendingImport.wire.traitInfo.kind === 'discrete-ambiguous'
            ? 'discrete'
            : undefined;
      const effectiveAnalysisKind = selectedAnalysisKind ?? currentAnalysisKind;
      const currentCoordinateKeys =
        pendingImport.wire.traitInfo.kind === 'continuous'
          ? `${pendingImport.wire.traitInfo.keyFamily.lat}|${pendingImport.wire.traitInfo.keyFamily.lon}`
          : undefined;
      const detectedHpdKeys = currentHpdKeys(pendingImport.wire);
      const shouldReparseAnalysis =
        selectedAnalysisKind !== undefined &&
        selectedAnalysisKind !== pendingImport.confirmedAnalysisKind &&
        selectedAnalysisKind !== currentAnalysisKind;
      const shouldReparseTrait =
        selectedTraitKey !== undefined &&
        selectedTraitKey !== '' &&
        selectedTraitKey !== pendingImport.confirmedTraitKey &&
        effectiveAnalysisKind === 'discrete' &&
        (pendingImport.wire.traitInfo.kind === 'discrete-ambiguous' ||
          (pendingImport.wire.traitInfo.kind === 'discrete' &&
            selectedTraitKey !== pendingImport.wire.traitInfo.key) ||
          pendingImport.wire.traitInfo.kind === 'continuous');
      const shouldReparseCoordinates =
        selectedCoordinateKeys !== undefined &&
        selectedCoordinateKeys !== '' &&
        selectedCoordinateKeys !== pendingImport.confirmedCoordinateKeys &&
        selectedCoordinateKeys !== currentCoordinateKeys &&
        effectiveAnalysisKind === 'continuous';
      const shouldReparseHpds =
        effectiveAnalysisKind === 'continuous' &&
        selectedHpdKeys !== undefined &&
        selectedHpdKeys !== pendingImport.confirmedHpdKeys &&
        selectedHpdKeys !== detectedHpdKeys;
      const shouldReparseMrsd =
        selection.manualMrsdIso !== undefined &&
        selection.manualMrsdIso !== pendingImport.manualMrsdIso;

      if (shouldReparseTrait && !shouldReparseAnalysis && !shouldReparseMrsd) {
        recordConfirmedTraitKey(selectedTraitKey);
        deliverParsed(
          rehydrate(withDiscreteTrait(pendingImport.wire, selectedTraitKey)),
          pendingImport.opts,
          pendingImport,
        );
        return;
      }

      if (
        shouldReparseAnalysis ||
        shouldReparseCoordinates ||
        shouldReparseHpds ||
        shouldReparseMrsd
      ) {
        const nextTraitKey =
          effectiveAnalysisKind === 'discrete' && selectedTraitKey !== ''
            ? selectedTraitKey
            : pendingImport.confirmedTraitKey;
        const nextCoordinateKeys =
          effectiveAnalysisKind === 'continuous' && selectedCoordinateKeys !== ''
            ? selectedCoordinateKeys
            : pendingImport.confirmedCoordinateKeys;
        const nextAnalysisKind = selectedAnalysisKind ?? pendingImport.confirmedAnalysisKind;
        const nextHpdKeys =
          effectiveAnalysisKind === 'continuous' ? selectedHpdKeys : pendingImport.confirmedHpdKeys;
        if (nextTraitKey !== undefined) recordConfirmedTraitKey(nextTraitKey);
        const text = pendingImport.inputText;
        const getBuffer = pendingImport.getArrayBuffer;
        const mrsdIso = selection.manualMrsdIso ?? pendingImport.manualMrsdIso;
        pendingBoundaryRef.current = pendingImport.opts?.pendingBoundary ?? null;
        pendingEnvironmentRef.current = pendingImport.opts?.pendingEnvironment ?? null;
        // Apply the confirmed settings and continue without reopening the modal.
        autoAcceptReparseRef.current = true;
        setPendingImport(null);
        if (text !== null) {
          void parseText(
            text,
            nextTraitKey,
            undefined,
            mrsdIso,
            nextCoordinateKeys,
            nextAnalysisKind,
            nextHpdKeys,
          );
        } else if (getBuffer !== null) {
          pendingGetArrayBufferRef.current = getBuffer;
          void getBuffer().then((buf) =>
            parseInput(
              buf,
              nextTraitKey,
              undefined,
              mrsdIso,
              nextCoordinateKeys,
              nextAnalysisKind,
              nextHpdKeys,
            ),
          );
        }
        return;
      }

      deliverParsed(rehydrate(pendingImport.wire), pendingImport.opts, pendingImport);
    },
    [deliverParsed, parseInput, parseText, pendingImport, recordConfirmedTraitKey],
  );

  const handleImportCancel = useCallback(() => {
    confirmedImportRef.current = null;
    setHandoffImport(null);
    setPendingImport(null);
    setLoaderParseStatus('idle');
  }, [setLoaderParseStatus]);

  const handleExampleClick = useCallback(
    (example: FixtureMeta, projectFile: ProjectFile | null = null) => {
      const fileName = example.treePath.split('/').pop() ?? example.treePath;
      prepareSource(
        fileName,
        example.id,
        projectFile,
        projectFile?.treeSourceRef?.confirmedTraitKey ?? null,
        projectFile?.treeSourceRef?.confirmedTipDatePattern ?? null,
      );

      const treePromise = fetch(publicAssetPath(example.treePath)).then((r) => r.text());
      const lookupPromise: Promise<Map<string, [number, number]> | null> = example.locationsPath
        ? fetch(publicAssetPath(example.locationsPath))
            .then((r) => (r.ok ? r.text() : null))
            .then((csv) => {
              if (csv === null) return null;
              const result = detectLookupCSV(csv);
              return result.kind === 'auto' ? result.mapping : null;
            })
            .catch(() => null)
        : Promise.resolve(null);

      // Fetch the example's boundary GeoJSON in parallel with the tree parse,
      // but DO NOT add it to customOverlays here. The raw GeoJSON may cover
      // the whole world (the shared Natural Earth fallback) while the
      // analysis only touches a few countries; we need the parsed branchTable
      // to know which features to keep. The pending boundary is held in a
      // ref and forwarded to App via `onParsed(opts.pendingBoundary)`, which
      // does the bbox-filter + addCustomOverlay once the BranchTable exists.
      const boundariesPath = example.boundariesPath;
      const boundaryPromise: Promise<PendingBoundary | null> = boundariesPath
        ? fetch(publicAssetPath(boundariesPath))
            .then((r) => (r.ok ? r.json() : null))
            .then((geojson: unknown) => {
              if (geojson === null) return null;
              return {
                id: `boundaries-${example.id}`,
                name: boundariesPath.split('/').pop() ?? 'boundaries.geojson',
                geojson: geojson as PendingBoundary['geojson'],
              };
            })
            .catch(() => null)
        : Promise.resolve(null);

      const environmentPath = example.environmentPath;
      const environmentPromise: Promise<PendingEnvironment | null> = environmentPath
        ? fetch(publicAssetPath(environmentPath))
            .then((r) => (r.ok ? r.text() : null))
            .then((text) => {
              if (text === null) return null;
              return {
                id: `environment-${example.id}`,
                name: environmentPath.split('/').pop() ?? 'environment.csv',
                text,
              };
            })
            .catch(() => null)
        : Promise.resolve(null);

      Promise.all([treePromise, lookupPromise, boundaryPromise, environmentPromise])
        .then(([treeText, mapping, boundary, environment]) => {
          if (replacement) replacementSourceRef.current.prefetchedLookup = mapping;
          else onPrefetchedLookup?.(mapping);
          pendingBoundaryRef.current = boundary;
          pendingEnvironmentRef.current = environment;
          return parseText(treeText);
        })
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          const code = decodeParseError(msg);
          if (code !== null) {
            setErrorCode(code);
          } else {
            setError(msg);
          }
        });
    },
    [onPrefetchedLookup, parseText, prepareSource, replacement],
  );

  const handleFile = useCallback(
    async (
      name: string,
      getText: () => Promise<string>,
      getArrayBuffer?: () => Promise<ArrayBuffer>,
      size?: number,
    ) => {
      const kind: InputKind | null = inputKindForFileName(name);
      if (!kind) {
        setError('Select a BEAST tree or .spreadgl2.json project file.');
        return;
      }
      try {
        if (size !== undefined) assertInputSize(kind, size);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'The selected file is too large.');
        return;
      }

      if (kind === 'project') {
        let text: string;
        try {
          text = await getText();
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Could not read project file.');
          return;
        }
        let parsed: ProjectFile;
        try {
          parsed = parseProjectFile(text);
          if (parsed.embedded) await applyEmbeddedData(parsed.embedded);
        } catch (err) {
          setError(
            err instanceof ProjectFileError
              ? `Invalid project file: ${err.message}`
              : err instanceof Error
                ? `Invalid embedded project data: ${err.message}`
                : 'Could not read project file.',
          );
          return;
        }

        const exampleId = parsed.treeSourceRef?.exampleId ?? null;

        if (!exampleId) {
          const treeRef = parsed.treeSourceRef;
          if (treeRef?.embeddedTree) {
            const treeText = await extractEmbeddedTree(treeRef);
            if (!treeText) {
              setError('Could not decompress the embedded tree in this project file.');
              return;
            }
            prepareSource(
              treeRef.fileName,
              null,
              parsed,
              treeRef.confirmedTraitKey,
              treeRef.confirmedTipDatePattern,
            );
            void parseText(
              treeText,
              treeRef.confirmedTraitKey ?? undefined,
              treeRef.confirmedTipDatePattern ?? undefined,
            );
          } else {
            setError(
              'This project file references a user-uploaded tree. Open the original tree file first, then re-import the project file.',
            );
          }
          return;
        }

        const match = examples.find((ex) => ex.id === exampleId);
        if (!match) {
          setError(`Project file references unknown example "${exampleId}".`);
          return;
        }
        handleExampleClick(match, parsed);
        return;
      }

      prepareSource(name, null);
      try {
        if (getArrayBuffer) {
          pendingGetArrayBufferRef.current = getArrayBuffer;
          const buffer = await getArrayBuffer();
          await parseInput(buffer);
        } else {
          await parseText(await getText());
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not read the selected file.');
      }
    },
    [parseInput, parseText, examples, handleExampleClick, prepareSource],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      importReturnFocusRef.current = openButtonRef.current;
      const file = e.dataTransfer.files[0];
      if (!file) return;
      void handleFile(file.name, () => file.text(), undefined, file.size);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragging(false);
  }, []);

  const handleOpenFile = useCallback(async () => {
    setPicking(true);
    try {
      const result = await openFilePicker();
      if (!result) return;
      void handleFile(result.name, result.text, result.arrayBuffer, result.size);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to open file: ${msg}`);
    } finally {
      setPicking(false);
    }
  }, [handleFile]);

  useEffect(() => {
    if (!autoLoadExampleId || autoLoadTriggeredRef.current || examples.length === 0) return;
    const match = examples.find((ex) => ex.id === autoLoadExampleId);
    if (!match) return;
    autoLoadTriggeredRef.current = true;
    handleExampleClick(match);
  }, [autoLoadExampleId, examples, handleExampleClick]);

  useEffect(() => {
    if (!autoLoadFile) return;
    const key = `${autoLoadFile.path}:${autoLoadFile.text.length}`;
    if (autoLoadFileKeyRef.current === key) return;
    autoLoadFileKeyRef.current = key;
    const fileName = autoLoadFile.path.split(/[\\/]/).pop() ?? autoLoadFile.path;
    prepareSource(fileName, null);
    void parseText(autoLoadFile.text);
  }, [autoLoadFile, parseText, prepareSource]);

  const visibleImport = pendingImport ?? handoffImport;
  const childModalOpen = visibleImport !== null || needsMrsd;
  const busy = loading || picking;
  const replacementDialogRef = useRef<HTMLDivElement>(null);
  useModalAccessibility({
    dialogRef: replacementDialogRef,
    initialFocusRef: openButtonRef,
    onEscape: busy ? undefined : onCancel,
    enabled: replacement && !childModalOpen,
  });

  const loaderContent = (
    <>
      <section
        aria-label="Drop zone for tree files"
        className={[styles.dropZone, dragging ? styles.dropZoneDragging : ''].join(' ')}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        data-testid="drop-zone"
      >
        {loading ? (
          <span className={styles.loadingText}>Parsing…</span>
        ) : (
          <>
            <Upload className={styles.dropIcon} aria-hidden="true" />
            <span className={styles.dropLabel}>Drop a BEAST X tree or SpreadGL2 project here</span>
            <span className={styles.dropFormats}>
              {['.tree', '.nex', '.nexus', '.trees', '.spreadgl2.json'].map((format) => (
                <span key={format}>{format}</span>
              ))}
            </span>
          </>
        )}
      </section>

      <button
        type="button"
        className={styles.openBtn}
        disabled={busy}
        onClick={() => {
          importReturnFocusRef.current = openButtonRef.current;
          void handleOpenFile();
        }}
        data-testid="loader-open-btn"
        ref={openButtonRef}
      >
        <FileUp size={16} aria-hidden="true" />
        Open file…
      </button>

      {loading &&
        (replacement ? (
          <StatusBar stage={replacementStage} progress={replacementProgress} />
        ) : (
          <StatusBar />
        ))}

      {errorCode !== null && (
        <ErrorPanel copy={ERROR_COPY[errorCode]} onTryAgain={handleTryAgain} />
      )}

      {error !== null && errorCode === null && (
        <div className={styles.error} role="alert" data-testid="loader-error">
          {error}
        </div>
      )}

      {!replacement && examples.length > 0 && (
        <div className={styles.examples}>
          <h2 className={styles.examplesTitle}>Try an example</h2>
          <div className={styles.exampleChips} data-testid="example-chips">
            {examples.map((ex) => (
              <button
                key={ex.id}
                type="button"
                className={styles.chip}
                onClick={(event) => {
                  importReturnFocusRef.current = event.currentTarget;
                  handleExampleClick(ex);
                }}
                disabled={loading}
                data-testid={`example-${ex.id}`}
              >
                <span>
                  <span className={styles.chipLabel}>{ex.label}</span>
                  <span className={styles.chipMeta}>
                    {TIP_COUNT_FORMATTER.format(ex.tipCount)} tips
                    {ex.traitKind && <> · {ex.traitKind}</>} · {exampleYears(ex.dateSpan)}
                    {ex.tipCount >= 10_000 && (
                      <>
                        {' '}
                        · <span className={styles.largeNote}>large dataset</span>
                      </>
                    )}
                  </span>
                </span>
                <ChevronRight className={styles.rowArrow} aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {visibleImport !== null && (
        <ImportSettingsModal
          wire={visibleImport.wire}
          onConfirm={handleImportConfirm}
          onCancel={handleImportCancel}
          returnFocusRef={importReturnFocusRef}
        />
      )}
      {needsMrsd && !overlayOnly && <MrsdModal onConfirm={handleMrsdConfirm} />}
      {replacement && (
        <div className={styles.replaceBackdrop} data-testid="replace-file-backdrop">
          <div
            ref={replacementDialogRef}
            className={styles.replaceModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="replace-file-title"
            aria-hidden={childModalOpen ? 'true' : undefined}
            tabIndex={-1}
            data-testid="replace-file-modal"
          >
            <button
              type="button"
              className={styles.closeBtn}
              aria-label="Cancel replacement"
              title="Cancel replacement"
              disabled={busy || childModalOpen}
              onClick={onCancel}
              data-testid="replace-file-cancel"
            >
              <X size={18} />
            </button>
            <h2 id="replace-file-title" className={styles.replaceTitle}>
              Replace tree
            </h2>
            <p className={styles.replaceDescription}>
              Your current session will remain open until the new file is ready.
            </p>
            <div className={styles.replaceContent}>{loaderContent}</div>
          </div>
        </div>
      )}
      {!overlayOnly && !replacement && (
        <div className={styles.root} data-testid="loader-root">
          <LandingHeader />
          <LandingPage action={loaderContent} />
        </div>
      )}
    </>
  );
}
