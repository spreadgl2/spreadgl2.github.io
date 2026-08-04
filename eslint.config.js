// ESLint boundary check for src/lib/phylo/ only.
// Biome handles formatting and general linting everywhere else.
// This config is narrow by design: no rules beyond the import-boundary check.
import boundaries from "eslint-plugin-boundaries";
import tsParser from "@typescript-eslint/parser";

const FORBIDDEN_EXTERNALS = [
  "react",
  "react-dom",
  "react/*",
  "zustand",
  "zustand/*",
  "@kepler.gl/*",
];

export default [
  {
    files: ["src/lib/phylo/**/*.ts"],
    ignores: ["src/lib/phylo/**/*.test.ts"],
    plugins: { boundaries },
    languageOptions: {
      parser: tsParser,
    },
    settings: {
      "import/resolver": {
        typescript: true,
      },
      "boundaries/elements": [
        { type: "phylo", pattern: "src/lib/phylo/**" },
        { type: "format", pattern: "src/lib/format/**" },
        { type: "other-lib", pattern: "src/lib/**" },
        { type: "feature", pattern: "src/features/**" },
        { type: "worker", pattern: "src/workers/**" },
        { type: "store", pattern: "src/store/**" },
        { type: "styles", pattern: "src/styles/**" },
      ],
    },
    rules: {
      // Internal boundary: phylo may only import from phylo and format.
      // External boundary: react, zustand, and @kepler.gl/* are forbidden.
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          checkAllOrigins: true,
          rules: [
            {
              from: { type: "phylo" },
              allow: { to: { type: ["phylo", "format"] } },
            },
            ...FORBIDDEN_EXTERNALS.map((mod) => ({
              from: { type: "phylo" },
              disallow: {
                to: { origin: ["external", "core"] },
                dependency: { module: mod },
              },
            })),
          ],
        },
      ],
    },
  },
];
