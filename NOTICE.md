# Third-Party Notices

SpreadGL2 is independently developed and includes adapted, vendored portions of
Andrew Rambaut's [peartree](https://github.com/artic-network/peartree) and
[pearcore](https://github.com/rambaut/pearcore), both MIT-licensed. Neither project
is a package, runtime, or build dependency of SpreadGL2.

The upstream MIT license is reproduced in `LICENSES/peartree.txt`.

The retained peartree-derived code is limited to:

| SpreadGL2 file | Upstream area | Retained relationship |
|---|---|---|
| `src/lib/phylo/parse.ts` | `peartree/js/treeio.js` and `phylograph.js` | Newick/NEXUS parsing and nested-tree to adjacency-graph construction, adapted and extended in strict TypeScript |
| `src/lib/phylo/types.ts` | `peartree/js/phylograph.js` | Adjacency-list `PhyloNode` and `PhyloGraph` model |
| `src/lib/phylo/layout.ts` | `peartree/js/treeutils.js` | Rectangular tree-layout algorithm, adapted and extended |
| `src/lib/phylo/calibrate.ts` | `peartree/js/phylograph.js` | Anchor-only subset of `TreeCalibration`; regression, rate, tick, and formatting systems are not retained |

Direct pearcore-framework reuse is limited to selected palette definitions and basic
lookup, categorical mapping, RGB parsing, and interpolation utilities in
`src/lib/tree-render/palettes.ts`, adapted from `pearcore/js/palettes.js`. The expanded
catalogue, Colorcet additions, theme handling, and most application helpers are
SpreadGL2 additions.

`src/lib/phylo/introspect.ts`, `annotate.ts`, and `slice.ts` are original SpreadGL2
implementations informed by the peartree graph model. The deck.gl renderer, map,
analysis, interface, exports, workers, and Tauri integration are otherwise original
SpreadGL2 implementations.

`src/features/map-view/TripsLayer.ts` is adapted from deck.gl 9.3.7's `TripsLayer`.
deck.gl is © vis.gl contributors and distributed under the MIT license. The upstream
license is reproduced in `LICENSES/deck.gl.txt`.

SpreadGL2 includes the first 64 colors from Colorcet 3.2.1's `glasbey_light`
and `glasbey_dark` palettes, exposed as static tree-render categorical palettes.
Colorcet is © HoloViz contributors and distributed under CC-BY 4.0:
<https://github.com/holoviz/colorcet>.

SpreadGL2 includes a generated fallback gazetteer for discrete phylogeography
location labels. The reproducible build pipeline lives at
<https://github.com/spreadgl2/spreadgl2-gazetteer>. It uses Natural Earth 1:10m
cultural vectors for countries and first-order administrative divisions,
U.S. Census Bureau 2025 National States Gazetteer internal points for U.S.
state-level entries, and documented manual representative points for broad
legacy region labels:
<https://www.naturalearthdata.com/>
<https://www.naturalearthdata.com/about/terms-of-use/>
<https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.html>.

Adapted files carry inline source citations with the upstream path and retained
line range.

SpreadGL2 itself is MIT-licensed; see [LICENSE](LICENSE).
