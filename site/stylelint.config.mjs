import plugins, { usage } from "./lint/stylelint-plugin.mjs";

const usageRules = new Set(usage.map((p) => p.ruleName));

export default {
  plugins,
  // Disable comments have no effect, so every finding stands.
  ignoreDisables: true,
  overrides: [{ files: ["**/*.astro"], customSyntax: "postcss-html" }],
  // Rule 5, every token read, runs as lint:usage with lint/usage.config.mjs until every page reads tokens.
  rules: Object.fromEntries(plugins.filter((p) => !usageRules.has(p.ruleName)).map((p) => [p.ruleName, true])),
};
