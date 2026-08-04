# Security Policy

## Supported Versions

Security fixes are made on the current `main` branch and the latest tagged
release. Older revisions are not supported. No prebuilt desktop installer is a
supported release until the project publishes an explicitly signed and
notarized release with checksums and provenance.

## Reporting a Vulnerability

Report vulnerabilities privately through
[GitHub private vulnerability reporting](https://github.com/spreadgl2/spreadgl2.github.io/security/advisories/new).
Do not include unpublished trees, sample identifiers, credentials, or exploit
details in a public issue.

Include the affected revision, platform, input type, reproduction steps, and
impact. Receipt should be acknowledged within seven days. A remediation
timeline will be provided after triage; coordinated disclosure is preferred.

## Security Boundaries

SpreadGL2 treats tree, log, project, CSV, GeoJSON, and GeoTIFF files as
untrusted. Inputs are parsed locally and are never uploaded by application
code. Primary file limits are:

| Input | Maximum file size |
| --- | ---: |
| BEAST tree or NEXUS | 128 MiB |
| BEAST log | 128 MiB |
| SpreadGL2 project | 96 MiB |
| GeoJSON | 32 MiB |
| CSV/TSV | 16 MiB |
| GeoTIFF | 256 MiB and 16,777,216 decoded pixels |

Embedded project payloads have class-specific decompressed limits and a 200:1
expansion guard. Declared log and raster dimensions must match decompressed
byte lengths exactly. GeoJSON feature, coordinate, and nesting counts; tree
node and annotation counts; and CSV/log dimensions are also bounded.

The web and desktop builds enforce CSPs that permit packaged application code
and the CARTO basemap endpoints. The Tauri frontend cannot request arbitrary
local paths: associated files are validated and read by Rust only after an OS
file-open event. Native dialog, filesystem, store, and URL-opener permissions
are limited to commands used by the application.

## Release Requirements

Publication builds must pass type checking, lint, unit/integration tests, the
production build, production npm audit, and RustSec audit. Workflow actions are
pinned to commit hashes and dependency updates are automated.

Before distributing desktop binaries, release maintainers must additionally:

1. Validate file associations, cache clearing, and input rejection on macOS,
   Windows, and Linux.
2. Sign and notarize installers using platform-appropriate identities.
3. Publish SHA-256 checksums, an SBOM, and build provenance.
4. Verify the final bundles contain no telemetry, source maps, or unexpected
   remote-script loaders.

The current repository workflow performs an unsigned, no-artifact desktop
compile check only. Its output must not be presented as a publication release.
