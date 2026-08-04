/**
 * Typography guardrail — keeps the font system (DESIGN §5.1, PRs #253/#254)
 * from drifting back to hard-coded values.
 *
 * Fails if any src CSS module:
 *   - sets `font-family` to anything other than `var(--font-sans)`,
 *     `var(--font-mono)`, or `inherit` (i.e. re-introduces raw
 *     system-ui / ui-monospace), or
 *   - sets `font-size` to anything other than a `--text-*` token (or
 *     `inherit`) — no raw px, so every panel shares one scale.
 *
 * The token definitions and @font-face rules live in `src/styles/tokens.css`,
 * which legitimately names the concrete families + sizes; that file is the
 * source of truth and is exempt.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXEMPT = new Set(['src/styles/tokens.css']);

const ALLOWED_FONT_FAMILY = /^(var\(--font-(sans|mono)\)|inherit)$/;
const ALLOWED_FONT_SIZE = /^(var\(--text-[a-z0-9]+\)|inherit)$/;

interface Violation {
  file: string;
  line: number;
  text: string;
  rule: string;
}

/** Pure per-line check — returns a rule string for each violation on the line. */
export function lineViolations(line: string): string[] {
  const rules: string[] = [];
  const family = line.match(/font-family:\s*([^;]+);/);
  if (family?.[1] && !ALLOWED_FONT_FAMILY.test(family[1].trim())) {
    rules.push('font-family must be var(--font-sans), var(--font-mono), or inherit');
  }
  const size = line.match(/font-size:\s*([^;]+);/);
  if (size?.[1] && !ALLOWED_FONT_SIZE.test(size[1].trim())) {
    rules.push('font-size must use a --text-* token (no raw px)');
  }
  return rules;
}

function listCssFiles(): string[] {
  const out = execSync("git ls-files -- 'src/**/*.css'", { cwd: REPO_ROOT, encoding: 'utf8' });
  return out
    .split('\n')
    .filter(Boolean)
    .filter((file) => existsSync(resolve(REPO_ROOT, file)));
}

function checkFile(rel: string): Violation[] {
  if (EXEMPT.has(rel)) return [];
  const lines = readFileSync(resolve(REPO_ROOT, rel), 'utf8').split('\n');
  return lines.flatMap((line, i) =>
    lineViolations(line).map((rule) => ({ file: rel, line: i + 1, text: line.trim(), rule })),
  );
}

function runCli(): void {
  const violations = listCssFiles().flatMap(checkFile);

  if (violations.length > 0) {
    console.error(`\n✗ Typography guardrail: ${violations.length} violation(s)\n`);
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line}  — ${v.rule}\n      ${v.text}`);
    }
    console.error(
      '\nUse the tokens in src/styles/tokens.css: --font-sans / --font-mono for\nfamilies, and the --text-* scale for sizes (no raw px).\n',
    );
    process.exit(1);
  }

  console.log('✓ Typography guardrail: all CSS uses the font + size tokens.');
}

// Run the check only when invoked directly (`tsx scripts/check-typography.ts`),
// not when imported by the test.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
