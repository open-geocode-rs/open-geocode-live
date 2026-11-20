import * as astroParser from "astro-eslint-parser";
import tseslint from "typescript-eslint";
import og from "./lint/eslint-plugin.mjs";
import { include } from "./lint/project.mjs";

// A style file holds no script or markup, so only the script and markup files of the include list are given to it.
const files = include
  .filter((p) => p.endsWith("**") || /\.(astro|ts|mjs)$/.test(p))
  .flatMap((p) => (p.endsWith("**") ? [`${p}/*.astro`, `${p}/*.ts`, `${p}/*.mjs`, `${p}/*.astro/*.ts`] : [p, `${p}/*.ts`]));
const rules = { "og/scripts": "error", "og/markup": "error" };

export default [
  // Disable comments have no effect, so every finding stands.
  { linterOptions: { noInlineConfig: true } },
  {
    files: files.filter((f) => f.endsWith(".astro")),
    plugins: { og },
    processor: "og/astro-scripts",
    languageOptions: { parser: astroParser, parserOptions: { parser: tseslint.parser, extraFileExtensions: [".astro"], sourceType: "module" } },
    rules,
  },
  {
    files: files.filter((f) => !f.endsWith(".astro")),
    plugins: { og },
    languageOptions: { parser: tseslint.parser, sourceType: "module" },
    rules,
  },
];
