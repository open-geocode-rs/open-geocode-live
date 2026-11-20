import plugins, { usage } from "./stylelint-plugin.mjs";

// Rule 5 alone, every token read. lint:usage runs it.
export default {
  plugins,
  ignoreDisables: true,
  overrides: [{ files: ["**/*.astro"], customSyntax: "postcss-html" }],
  rules: Object.fromEntries(usage.map((p) => [p.ruleName, true])),
};
