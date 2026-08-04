import { describe, expect, it } from 'vitest';
import {
  applyProject,
  extractEmbeddedTree,
  ProjectFileError,
  parseProjectFile,
  type SerializeInput,
  serializeProject,
  serializeProjectFile,
} from './project';
import type { EmbeddedData } from './project-embed';

const SAMPLE_INPUT: SerializeInput = {
  treeSourceRef: {
    fileName: 'pedv.tree',
    exampleId: null,
    confirmedTraitKey: 'location',
    confirmedTipDatePattern: '_YY.M',
  },
  timeline: {
    playhead: 2003.5,
    window: { start: 2002.0, end: 2003.5 },
    windowSize: 1.5,
    speed: 1,
    mode: 'Trail',
    arcs: false,
    clade: false,
    subtreeRootIds: [],
    subtreeRootId: null,
  },
  selection: {
    selectedIds: ['node-1', 'node-2'],
    selectedBranchIds: [0, 5, 12],
  },
  filters: {
    focusedTaxa: ['tip-a', 'tip-b'],
    deselectedValues: ['Beijing'],
    posteriorThreshold: 0.42,
  },
  panels: {
    activePanel: 'style',
    visibleViews: { tree: true, map: true, analysis: true },
    layerVisibility: { branches: true, 'hpd-polygons': false, 'cluster-endpoints': true },
    layerOpacity: { branches: 100, 'hpd-polygons': 100, 'cluster-endpoints': 100 },
  },
  style: {
    colorByKey: 'location',
    glyphByKey: 'none',
    palette: 'okabe-ito',
    paletteReverse: false,
    showBranches: true,
    branchWidth: 1.5,
    arcWidth: 75,
    showTips: true,
    tipRadius: 2.5,
    treeOpacity: 100,
    treeSortOrder: 'file',
    theme: 'dark',
  },
  environment: {
    activeKey: 'temperature',
    paletteOverride: { temperature: 'cool-warm' },
  },
};

describe('serializeProject / parseProjectFile round-trip', () => {
  it('round-trips a full project file', () => {
    const file = serializeProject(SAMPLE_INPUT);
    const json = JSON.stringify(file);
    const parsed = parseProjectFile(json);
    const applied = applyProject(parsed);

    expect(applied.treeSourceRef).toEqual(SAMPLE_INPUT.treeSourceRef);
    expect(applied.timeline).toEqual(SAMPLE_INPUT.timeline);
    expect(applied.selection).toEqual(SAMPLE_INPUT.selection);
    expect(applied.filters).toEqual(SAMPLE_INPUT.filters);
    expect(applied.panels).toEqual(SAMPLE_INPUT.panels);
    expect(applied.style).toEqual(SAMPLE_INPUT.style);
    expect(applied.environment).toEqual(SAMPLE_INPUT.environment);
  });

  it('round-trips with null treeSourceRef', () => {
    const input: SerializeInput = { ...SAMPLE_INPUT, treeSourceRef: null };
    const file = serializeProject(input);
    const parsed = parseProjectFile(JSON.stringify(file));
    expect(parsed.treeSourceRef).toBeNull();
  });

  it('reduces imported tree filenames to a safe basename', () => {
    const file = serializeProject(SAMPLE_INPUT);
    if (!file.treeSourceRef) throw new Error('Expected tree source');
    file.treeSourceRef.fileName = '../../private/pedv.tree';
    expect(parseProjectFile(JSON.stringify(file)).treeSourceRef?.fileName).toBe('pedv.tree');
  });

  it('round-trips with null timeline.window', () => {
    const input: SerializeInput = {
      ...SAMPLE_INPUT,
      timeline: { ...SAMPLE_INPUT.timeline, window: null, windowSize: null },
    };
    const file = serializeProject(input);
    const parsed = parseProjectFile(JSON.stringify(file));
    expect(parsed.timeline.window).toBeNull();
    expect(parsed.timeline.windowSize).toBeNull();
  });

  it('derives timeline.windowSize when parsing older files with a window', () => {
    const file = serializeProject(SAMPLE_INPUT);
    const legacy = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    const timeline = legacy.timeline as Record<string, unknown>;
    delete timeline.windowSize;

    const parsed = parseProjectFile(JSON.stringify(legacy));

    expect(parsed.timeline.windowSize).toBeCloseTo(1.5);
  });

  it('round-trips multiple selected clade roots', () => {
    const input: SerializeInput = {
      ...SAMPLE_INPUT,
      timeline: {
        ...SAMPLE_INPUT.timeline,
        clade: true,
        subtreeRootIds: ['node-a', 'node-b'],
        subtreeRootId: 'node-a',
      },
    };
    const file = serializeProject(input);
    const parsed = parseProjectFile(JSON.stringify(file));

    expect(parsed.timeline.subtreeRootIds).toEqual(['node-a', 'node-b']);
    expect(parsed.timeline.subtreeRootId).toBe('node-a');
  });

  it('imports legacy single-clade project files as a one-root clade set', () => {
    const file = serializeProject({
      ...SAMPLE_INPUT,
      timeline: {
        ...SAMPLE_INPUT.timeline,
        clade: true,
        subtreeRootIds: ['node-a'],
        subtreeRootId: 'node-a',
      },
    });
    const legacy = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    const timeline = legacy.timeline as Record<string, unknown>;
    delete timeline.subtreeRootIds;

    const parsed = parseProjectFile(JSON.stringify(legacy));

    expect(parsed.timeline.subtreeRootIds).toEqual(['node-a']);
    expect(parsed.timeline.subtreeRootId).toBe('node-a');
  });

  it('round-trips with null activePanel', () => {
    const input: SerializeInput = {
      ...SAMPLE_INPUT,
      panels: { ...SAMPLE_INPUT.panels, activePanel: null },
    };
    const file = serializeProject(input);
    const parsed = parseProjectFile(JSON.stringify(file));
    expect(parsed.panels.activePanel).toBeNull();
  });

  it('defaults visibleViews when parsing an older project file', () => {
    const file = serializeProject(SAMPLE_INPUT);
    const legacy = {
      ...file,
      panels: {
        activePanel: file.panels.activePanel,
        layerVisibility: file.panels.layerVisibility,
        layerOpacity: file.panels.layerOpacity,
      },
    };
    const parsed = parseProjectFile(JSON.stringify(legacy));
    expect(parsed.panels.visibleViews).toEqual({ tree: true, map: true, analysis: true });
  });

  it('defaults filters, environment, and newer style controls when parsing older files', () => {
    const file = serializeProject(SAMPLE_INPUT);
    const legacy = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    delete legacy.filters;
    delete legacy.environment;
    const style = legacy.style as Record<string, unknown>;
    delete style.showBranches;
    delete style.arcWidth;
    delete style.showTips;

    const parsed = parseProjectFile(JSON.stringify(legacy));

    expect(parsed.filters).toEqual({
      focusedTaxa: [],
      deselectedValues: [],
      posteriorThreshold: 0,
    });
    expect(parsed.environment).toEqual({ activeKey: null, paletteOverride: {} });
    expect(parsed.style.showBranches).toBe(true);
    expect(parsed.style.arcWidth).toBe(20);
    expect(parsed.style.showTips).toBe(true);
  });

  it('defaults dateOverrides when parsing older files', () => {
    const file = serializeProject(SAMPLE_INPUT);
    const legacy = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    delete legacy.dateOverrides;

    const parsed = parseProjectFile(JSON.stringify(legacy));

    expect(parsed.dateOverrides).toEqual([]);
  });

  it('round-trips manual and CSV date overrides', () => {
    const input: SerializeInput = {
      ...SAMPLE_INPUT,
      dateOverrides: [
        {
          nodeId: 'tip-1',
          taxon: 'A|2010',
          parsedSubstring: '2011-03-01',
          decimalYear: 2011.164384,
          format: 'iso-date',
          source: 'manual',
        },
        {
          nodeId: 'tip-2',
          taxon: 'B|2012',
          parsedSubstring: '2012',
          decimalYear: 2012,
          format: 'year-only',
          source: 'csv',
        },
      ],
    };

    const file = serializeProject(input);
    const parsed = parseProjectFile(JSON.stringify(file));

    expect(parsed.dateOverrides).toEqual(input.dateOverrides);
  });

  it('rejects project files with all workspace views hidden', () => {
    const file = serializeProject({
      ...SAMPLE_INPUT,
      panels: {
        ...SAMPLE_INPUT.panels,
        visibleViews: { tree: false, map: false, analysis: false },
      },
    });
    expect(() => parseProjectFile(JSON.stringify(file))).toThrow(ProjectFileError);
  });

  it('round-trips Window mode', () => {
    const input: SerializeInput = {
      ...SAMPLE_INPUT,
      timeline: { ...SAMPLE_INPUT.timeline, mode: 'Window' },
    };
    const file = serializeProject(input);
    const parsed = parseProjectFile(JSON.stringify(file));
    expect(parsed.timeline.mode).toBe('Window');
  });

  it('preserves version = 1 in output', () => {
    const file = serializeProject(SAMPLE_INPUT);
    expect(file.version).toBe(1);
    const parsed = parseProjectFile(JSON.stringify(file));
    expect(parsed.version).toBe(1);
  });
});

describe('serializeProjectFile with embedded tree', () => {
  it('embeds gzipped tree when no exampleId and rawTreeText provided', async () => {
    const treeText = '(A:1.0,B:1.0)root;';
    const input: SerializeInput = {
      ...SAMPLE_INPUT,
      treeSourceRef: {
        fileName: 'my-tree.nex',
        exampleId: null,
        confirmedTraitKey: null,
        confirmedTipDatePattern: null,
      },
      rawTreeText: treeText,
    };
    const file = await serializeProjectFile(input);
    expect(file.treeSourceRef?.embeddedTree).toBeTruthy();
    expect(typeof file.treeSourceRef?.embeddedTree).toBe('string');
  });

  it('round-trips embedded tree text through extractEmbeddedTree', async () => {
    const treeText = '#NEXUS\nBegin trees;\n  tree TREE1 = (A:1.0,B:1.0)root;\nEnd;';
    const input: SerializeInput = {
      ...SAMPLE_INPUT,
      treeSourceRef: {
        fileName: 'user-tree.nex',
        exampleId: null,
        confirmedTraitKey: 'location',
        confirmedTipDatePattern: null,
      },
      rawTreeText: treeText,
    };
    const file = await serializeProjectFile(input);
    expect(file.treeSourceRef?.embeddedTree).toBeTruthy();

    const treeSourceRef = file.treeSourceRef;
    if (!treeSourceRef) throw new Error('expected embedded tree source ref');
    const recovered = await extractEmbeddedTree(treeSourceRef);
    expect(recovered).toBe(treeText);
  });

  it('does not embed tree when exampleId is set', async () => {
    const input: SerializeInput = {
      ...SAMPLE_INPUT,
      treeSourceRef: {
        fileName: 'yfv.nex',
        exampleId: 'yfv',
        confirmedTraitKey: 'location',
        confirmedTipDatePattern: null,
      },
      rawTreeText: '(A:1.0,B:1.0);',
    };
    const file = await serializeProjectFile(input);
    expect(file.treeSourceRef?.embeddedTree).toBeUndefined();
  });

  it('does not embed when rawTreeText is absent', async () => {
    const input: SerializeInput = {
      ...SAMPLE_INPUT,
      treeSourceRef: {
        fileName: 'user-tree.nex',
        exampleId: null,
        confirmedTraitKey: null,
        confirmedTipDatePattern: null,
      },
    };
    const file = await serializeProjectFile(input);
    expect(file.treeSourceRef?.embeddedTree).toBeUndefined();
  });

  it('round-trips full project file with embedded tree through parseProjectFile', async () => {
    const treeText = '#NEXUS\nBegin trees;\n  tree T = (A:0.5,B:0.5);';
    const input: SerializeInput = {
      ...SAMPLE_INPUT,
      treeSourceRef: {
        fileName: 'custom.nex',
        exampleId: null,
        confirmedTraitKey: null,
        confirmedTipDatePattern: null,
      },
      rawTreeText: treeText,
    };
    const file = await serializeProjectFile(input);
    const json = JSON.stringify(file);
    const parsed = parseProjectFile(json);
    expect(parsed.treeSourceRef?.embeddedTree).toBeTruthy();

    const treeSourceRef = parsed.treeSourceRef;
    if (!treeSourceRef) throw new Error('expected embedded tree source ref');
    const recovered = await extractEmbeddedTree(treeSourceRef);
    expect(recovered).toBe(treeText);
  });
});

describe('mapOpacity → treeOpacity backward-compat migration', () => {
  it('reads treeOpacity from legacy mapOpacity when treeOpacity is absent', () => {
    const file = serializeProject(SAMPLE_INPUT);
    const raw = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    const style = raw.style as Record<string, unknown>;
    delete style.treeOpacity;
    style.mapOpacity = 75;
    const parsed = parseProjectFile(JSON.stringify(raw));
    expect(parsed.style.treeOpacity).toBe(75);
  });

  it('treeOpacity wins over mapOpacity when both are present', () => {
    const file = serializeProject(SAMPLE_INPUT);
    const raw = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    const style = raw.style as Record<string, unknown>;
    style.treeOpacity = 80;
    style.mapOpacity = 40;
    const parsed = parseProjectFile(JSON.stringify(raw));
    expect(parsed.style.treeOpacity).toBe(80);
  });
});

describe('parseProjectFile validation', () => {
  it('throws on invalid JSON', () => {
    expect(() => parseProjectFile('not json')).toThrow(ProjectFileError);
  });

  it('throws on wrong version', () => {
    const file = { ...serializeProject(SAMPLE_INPUT), version: 99 };
    expect(() => parseProjectFile(JSON.stringify(file))).toThrow(ProjectFileError);
  });

  it('throws on invalid timeline.mode', () => {
    const file = serializeProject(SAMPLE_INPUT);
    const raw = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    (raw.timeline as Record<string, unknown>).mode = 'NotAMode';
    expect(() => parseProjectFile(JSON.stringify(raw))).toThrow(ProjectFileError);
  });

  it('throws on invalid timeline.windowSize', () => {
    const file = serializeProject(SAMPLE_INPUT);
    const raw = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    (raw.timeline as Record<string, unknown>).windowSize = 'wide';
    expect(() => parseProjectFile(JSON.stringify(raw))).toThrow(ProjectFileError);
  });

  it('throws on invalid style.palette', () => {
    const file = serializeProject(SAMPLE_INPUT);
    const raw = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    (raw.style as Record<string, unknown>).palette = 'rainbow';
    expect(() => parseProjectFile(JSON.stringify(raw))).toThrow(ProjectFileError);
  });

  it('throws on non-string selectedIds entries', () => {
    const file = serializeProject(SAMPLE_INPUT);
    const raw = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    (raw.selection as Record<string, unknown>).selectedIds = [1, 2];
    expect(() => parseProjectFile(JSON.stringify(raw))).toThrow(ProjectFileError);
  });

  it('throws on invalid filter entries', () => {
    const file = serializeProject(SAMPLE_INPUT);
    const raw = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    (raw.filters as Record<string, unknown>).focusedTaxa = [1];
    expect(() => parseProjectFile(JSON.stringify(raw))).toThrow(ProjectFileError);
  });

  it('throws on invalid environment palette overrides', () => {
    const file = serializeProject(SAMPLE_INPUT);
    const raw = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    (raw.environment as Record<string, unknown>).paletteOverride = {
      temperature: 'not-a-palette',
    };
    expect(() => parseProjectFile(JSON.stringify(raw))).toThrow(ProjectFileError);
  });

  it('throws on invalid date override entries', () => {
    const file = serializeProject(SAMPLE_INPUT);
    const raw = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    raw.dateOverrides = [
      {
        nodeId: 'tip-1',
        taxon: 'A|2010',
        parsedSubstring: '2010',
        decimalYear: '2010',
        format: 'year-only',
        source: 'manual',
      },
    ];

    expect(() => parseProjectFile(JSON.stringify(raw))).toThrow(ProjectFileError);
  });

  it('throws when top-level is not an object', () => {
    expect(() => parseProjectFile('"a string"')).toThrow(ProjectFileError);
  });
});

describe('parseProjectFile embedded data', () => {
  const EMBEDDED: EmbeddedData = {
    geo: { source: 'csv', entries: [['A', 1, 2]] },
    log: { fileName: 'x.log', columnNames: ['a'], rowCount: 1, columnsGz: 'AAAA' },
    layers: {
      boundaries: [{ id: 'b1', name: 'B', dataGz: 'Zzz' }],
      choropleths: [
        {
          id: 'c1',
          name: 'C',
          dataGz: 'Zzz',
          valueColumn: 'v',
          locationCol: 'loc',
          valueByLocation: [['A', 1.5]],
        },
      ],
      envColumns: [{ key: 'k', displayName: 'K', units: 'mm', values: [['A', 1.5]] }],
      raster: { width: 2, height: 2, bounds: [0, 0, 1, 1], dataGz: 'Zzz' },
    },
  };

  it('round-trips the embedded blob through parseProjectFile', () => {
    const file = serializeProject({ ...SAMPLE_INPUT, embedded: EMBEDDED });
    const parsed = parseProjectFile(JSON.stringify(file));
    expect(parsed.embedded?.geo?.entries[0]).toEqual(['A', 1, 2]);
    expect(parsed.embedded?.log?.fileName).toBe('x.log');
    expect(parsed.embedded?.layers?.boundaries?.[0]?.id).toBe('b1');
    expect(parsed.embedded?.layers?.choropleths?.[0]?.valueByLocation).toEqual([['A', 1.5]]);
    expect(parsed.embedded?.layers?.envColumns?.[0]?.units).toBe('mm');
    expect(parsed.embedded?.layers?.raster?.width).toBe(2);
  });

  it('drops malformed layer pieces but keeps valid ones', () => {
    const file = serializeProject({ ...SAMPLE_INPUT, embedded: EMBEDDED });
    const raw = JSON.parse(JSON.stringify(file)) as Record<string, unknown>;
    const layers = (raw.embedded as { layers: Record<string, unknown> }).layers;
    // Corrupt the raster (missing dataGz) and the boundary (missing name);
    // leave the choropleth valid.
    layers.raster = { width: 2, height: 2, bounds: [0, 0, 1, 1] };
    layers.boundaries = [{ id: 'x' }];

    const parsed = parseProjectFile(JSON.stringify(raw));
    expect(parsed.embedded?.layers?.raster).toBeUndefined();
    expect(parsed.embedded?.layers?.boundaries).toBeUndefined();
    expect(parsed.embedded?.layers?.choropleths?.[0]?.id).toBe('c1');
  });

  it('omits embedded entirely when absent', () => {
    const parsed = parseProjectFile(JSON.stringify(serializeProject(SAMPLE_INPUT)));
    expect(parsed.embedded).toBeUndefined();
  });
});
