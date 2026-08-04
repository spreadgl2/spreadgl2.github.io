# SpreadGL2

SpreadGL2 is an interactive viewer for phylogeographic trees produced by
[BEAST X](https://beast.community). It runs as a web application and as a
Tauri desktop application. Tree topology, inferred locations, uncertainty,
and movement through time are shown together in a linked tree and map view.

## Capabilities

- Load BEAST MCC trees in Newick or NEXUS form.
- Visualize continuous and discrete phylogeographic reconstructions.
- Animate lineage movement in trail, window, slice, arc, and clade modes.
- Inspect node annotations, location uncertainty, and HPD polygons.
- Color and filter branches by posterior support or annotated traits.
- Analyze lineage-through-time curves, migration transitions, BSSVS support,
  Markov jumps, and actual migration rates.
- Import location, boundary, raster, and environmental data.
- Export images, tables, project files, and shareable application state.
- Work entirely in the browser or build a native Tauri application.

SpreadGL2 performs visualization and posterior-summary calculations. It does
not run phylogenetic inference and does not replace validation of the original
BEAST analysis.

## Requirements

- Node.js 22 or newer
- pnpm 9
- A WebGL2-capable browser
- Rust 1.88 or newer for desktop builds

For the 17,716-tip B.1.1.7 workflow, 8 GB RAM, at least 8 logical CPU threads,
and a current desktop-class GPU are recommended. Auto rendering reduces pixel
density and animation work for large trees and constrained devices. See
[`PERFORMANCE.md`](PERFORMANCE.md) for the tested scope, budgets, and physical
hardware validation protocol.

## Run Locally

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Vite serves the application at <http://localhost:5173>.

Create and preview a production web build with:

```sh
pnpm build
pnpm preview
```

The static build is written to `dist/` and can be hosted by any static web
server.

Set `VITE_BASE_PATH` when deploying below a host root. Set
`VITE_REPOSITORY_URL` to the public repository URL so the application header
links to the correct README and issue tracker. The included GitHub Pages and
release workflows set both values automatically from repository metadata.

## Input Data

The primary input is a BEAST MCC tree containing a single rooted tree. Both
plain Newick and NEXUS wrappers are accepted. Branch lengths must be numeric.
Dates are represented internally as decimal years.

For continuous phylogeography, node annotations should contain longitude and
latitude traits such as `location1` and `location2`. Coordinates must already
be WGS84 longitude/latitude; runtime CRS reprojection is intentionally not
performed.

For discrete phylogeography, annotations identify named states. A companion
CSV can map those states to coordinates. Optional GeoJSON boundaries, CSV
region data, GeoTIFF rasters, and BEAST log files can be loaded through the
Layers and Analysis panels.

Large user-supplied files are parsed locally. SpreadGL2 does not upload tree
or analysis files and includes no telemetry or crash-reporting integration.
Primary limits are 128 MiB for trees and logs, 96 MiB for projects, 32 MiB for
GeoJSON, 16 MiB for CSV/TSV, and 256 MiB plus 16 million decoded pixels for
GeoTIFF. Embedded project data and parsed structures have additional expansion,
dimension, and collection limits documented in [`SECURITY.md`](SECURITY.md).

Parsed trees may be cached locally in IndexedDB up to a 200 MiB LRU budget and
can be cleared from **Settings > Local data**. CARTO basemap resources are
requested only when the map is opened; scientific data is not included in
those requests. See [`PRIVACY.md`](PRIVACY.md) for storage, network, and data
removal details.

## Typical Workflow

1. Open or drop a BEAST X tree, or select one of the bundled examples.
2. Review the detected dates and geographic annotations in Import Settings,
   then confirm or adjust the selections before visualization.
3. For a discrete tree without complete coordinates, review the gazetteer
   matches and optionally open or drop a CSV, TSV, or TXT location lookup.
4. Resolve any reported missing locations, inspect the linked tree and map,
   and use the timeline to explore geographic movement through time.
5. Export figures, tables, or a project file together with the original input
   files and exact SpreadGL2 revision used for the analysis.

## Bundled Examples

Three checked-in examples exercise the principal scientific workflows:

| Example | Tips | Model | Purpose |
| --- | ---: | --- | --- |
| PEDV in China | 769 | Discrete phylogeography | State lookup, boundaries, clusters, BSSVS, and environmental overlays |
| Yellow Fever virus in Brazil | 705 | Continuous phylogeography | HPD polygons, secondary traits, filters, and lineage-through-time analysis |
| SARS-CoV-2 B.1.1.7 in the UK | 17,716 | Continuous phylogeography | Large-tree parsing, rendering, and animation stress testing |

The examples and their companion files are stored in `public/examples/` and
are available directly from the landing screen.

## Quality Checks

The default publication checks are deterministic and suitable for pull
requests:

```sh
pnpm typecheck
pnpm lint
pnpm test:ci
pnpm build
pnpm audit --prod --audit-level high
cargo test --locked --manifest-path src-tauri/Cargo.toml
```

Additional checks are separated by cost and environment sensitivity:

```sh
pnpm test                 # complete Vitest suite
pnpm test:e2e:smoke       # PEDV, YFV, and publication-usability workflows
pnpm test:e2e:full        # all non-performance browser tests
pnpm test:stress          # B.1.1.7 wall-clock budget
pnpm test:e2e:perf        # serialized frame-time, memory, CPU, and DPR budgets
```

Install Chromium before the first Playwright run:

```sh
pnpm exec playwright install chromium
```

Timing checks are regression signals on comparable hardware. Shared or
software-rendered CI runners are not suitable for absolute graphics-performance
claims. The performance workflow runs weekly and for version tags; physical
older-GPU validation remains a separate publication requirement.

## Desktop Application

Run the Tauri development application with:

```sh
pnpm tauri:dev
```

Build the native application with:

```sh
pnpm tauri:build
```

Platform-specific system libraries required by Tauri are documented in the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).

The desktop wrapper processes scientific files locally, but uncached CARTO
basemap content requires network access. The included desktop workflow is an
unsigned compile check and publishes no installers. Do not distribute desktop
binaries as publication releases until platform signing, notarization,
checksums, SBOM, provenance, and cross-platform security validation are
complete; see [`SECURITY.md`](SECURITY.md).

## Architecture

The application is implemented in React and TypeScript. Zustand stores hold
application state, parser and log workers isolate expensive input processing,
and deck.gl with MapLibre renders the linked tree and map. The framework-free
scientific and data-processing modules live under `src/lib/`.

The native application in `src-tauri/` wraps the same production web build.
There is no separate desktop implementation of the scientific pipeline.

## Reproducibility

The repository includes the fixtures used by the automated scientific and
rendering tests. Package versions are pinned by `pnpm-lock.yaml`, and the
normal CI workflow runs type checking, linting, deterministic tests, and the
production build. Stress tests and native builds are available as separate
workflows so environment-sensitive measurements do not block ordinary changes.

For a reproducible analysis record, retain the original BEAST tree and log,
all companion location or layer files, the exported SpreadGL2 project file,
and the exact application revision used to produce outputs.

## Security and Privacy

The repository security policy, supported revision policy, private reporting
route, input limits, and desktop release requirements are in
[`SECURITY.md`](SECURITY.md). Local persistence, CARTO network access, cache
clearing, and data-removal guidance are in [`PRIVACY.md`](PRIVACY.md).

## Attribution

SpreadGL2 contains bounded, vendored adaptations of MIT-licensed code by
Andrew Rambaut:

- [peartree](https://github.com/artic-network/peartree): Newick/NEXUS parsing,
  adjacency-graph construction, rectangular tree layout, and anchor-based date
  calibration.
- [pearcore](https://github.com/rambaut/pearcore): selected palette definitions
  and basic color utilities.

There is no peartree or pearcore package, runtime, or build dependency. The
renderer, geographic processing, analysis modules, application interface,
workers, exports, and Tauri integration are SpreadGL2 implementations. Exact
source relationships and additional third-party data notices are recorded in
[`NOTICE.md`](NOTICE.md). The upstream MIT text is included in
[`LICENSES/peartree.txt`](LICENSES/peartree.txt).

## License

SpreadGL2 is distributed under the MIT License. See [`LICENSE`](LICENSE).
