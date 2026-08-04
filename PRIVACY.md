# Privacy and Data Lifecycle

## Scientific Data

Trees, logs, projects, coordinate tables, GeoJSON, and GeoTIFF files are
processed on the user's device. SpreadGL2 contains no telemetry, analytics,
crash reporting, advertising, or scientific-data upload integration.

Parsed tree results may be retained in the browser or desktop webview's
IndexedDB storage under `spreadgl2-parse-cache`. The cache uses a 200 MiB
least-recently-used budget and can contain topology, sample names, dates,
traits, annotations, and layout data. Hashing cache keys does not anonymize the
cached values.

Use **Settings > Local data > Clear tree cache** to remove all parsed-tree
cache entries. Browser preferences are stored in local storage; desktop
preferences are stored in the Tauri application data directory. **Reset to
defaults** clears preferences but is separate from the tree-cache control.
Users handling embargoed or identifiable data should clear the cache after a
session and use an isolated browser or operating-system profile on shared
systems.

## Network Requests

The application itself is served by its host, such as GitHub Pages. When the
map is opened, MapLibre requests the selected style, vector tiles, sprites, and
glyphs from `basemaps.cartocdn.com` and its subdomains. CARTO infrastructure
can observe ordinary connection metadata such as IP address, user agent,
request timing, and referrer policy behavior. Scientific file contents and
parsed values are not attached to those requests.

SpreadGL2 does not prefetch CARTO resources from the landing screen. External
documentation and repository links are contacted only after the user opens
them. The current desktop build is therefore described as local-processing,
not fully offline: uncached basemap content requires network access.

## Clearing Data

To remove application data:

1. Clear the tree cache in Settings.
2. Reset preferences if required.
3. Close the application.
4. For complete profile removal, clear site data for the deployment origin or
   remove the SpreadGL2 desktop webview/application-data profile using the
   operating system's application-data controls.

Exported images, tables, videos, and project files are ordinary user-selected
files outside application-managed storage and must be deleted separately.
