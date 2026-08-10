# Performance and Hardware Support

## Supported Scope

SpreadGL2 requires a WebGL2-capable desktop browser. The bundled 17,716-tip
B.1.1.7 tree is the maintained large-data baseline. For that workflow, 8 GB of
system RAM, at least 8 logical CPU threads, and a current desktop-class GPU are
recommended.

Current automated measurements use headless Chromium and software rendering.
They are regression budgets, not claims about absolute frame rates on end-user
hardware. Physical older integrated-GPU hardware has not yet been validated;
SpreadGL2 should not be described as supporting that class of hardware until a
result is recorded using the protocol below.

## Rendering Policy

The Settings panel provides three rendering choices:

- **Auto** selects Performance for trees with at least 30,000 branches, devices
  with at most 4 logical CPU threads, or devices reporting at most 4 GB of
  memory. It selects Quality otherwise.
- **Quality** renders deck.gl at up to 2x device pixels and uses two trail
  passes.
- **Performance** renders deck.gl at 1x device pixels, uses one trail pass, and
  lowers the frequency of CPU cluster and tree-color updates during playback.

Paused timeline inspection remains exact in every mode. Reduced motion stops
automatic playback and CSS transitions while retaining manual timeline
navigation.

MapLibre keeps `preserveDrawingBuffer` enabled because PNG and video export
composite the live basemap canvas. This is an intentional export-correctness
tradeoff. The frame-time budgets below include that cost.

Cold-start resource warming is skipped when Save-Data is enabled, the effective
connection is 2G, the device reports at most 4 logical CPU threads, or the
device reports at most 4 GB of memory. High-DPI sprites are loaded on demand
rather than prefetched.

## Automated Budgets

`pnpm test:stress` enforces a 5-second parser-pipeline budget and a 50 ms
main-thread rehydration budget for B.1.1.7.

`pnpm test:e2e:perf` runs serially and enforces these warmed animation budgets:

| Profile | Effective FPS | p95 frame time | p99 frame time | JS heap |
| --- | ---: | ---: | ---: | ---: |
| Standard Chromium | >= 20 | <= 50 ms | <= 100 ms | <= 350 MB |
| 4x CPU, DPR 2, Performance | >= 10 | <= 100 ms | <= 250 ms | <= 350 MB |

The browser suite also reports the largest cold frame separately and verifies
that the constrained DPR 2 profile renders the deck.gl canvas at 1x. The stress
workflow runs weekly, on version tags, and on explicit dispatch. Weekly browser
measurements are non-blocking because GitHub-hosted software-rendering capacity
is not fixed; version-tag runs and explicitly requested browser runs enforce the
budgets. The deterministic parser and rehydration budget remains blocking on
every workflow trigger.

## Physical Validation Protocol

Before claiming support for older hardware:

1. Use a clean production revision and close unrelated applications.
2. Record the commit, operating system, browser version, CPU, GPU, RAM, display
   resolution, and device pixel ratio.
3. Run the B.1.1.7 Trail/Trips, Trail/Arcs, Window/Trips, and Window/Arcs cases
   in Auto and Performance modes.
4. Record cold-load time, effective FPS, p50/p95/p99 frame time, peak JS heap,
   and whether interaction, labels, map tiles, and exports remain correct.
5. Repeat each case three times and publish the median warmed result together
   with the worst cold frame.

Do not compare headless CI values directly with physical-browser values. Keep
the machine and browser fixed when using either result as a regression series.
