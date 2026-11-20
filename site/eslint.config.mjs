import * as astroParser from "astro-eslint-parser";
import tseslint from "typescript-eslint";
import og from "./lint/eslint-plugin.mjs";
import { include } from "./lint/project.mjs";

const files = include.flatMap((p) => (p.endsWith("**") ? [`${p}/*.astro`, `${p}/*.ts`, `${p}/*.mjs`, `${p}/*.astro/*.ts`] : [p, `${p}/*.ts`]));
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
