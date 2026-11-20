import plugins from "./lint/stylelint-plugin.mjs";

export default {
  plugins,
  // Disable comments have no effect, so every finding stands.
  ignoreDisables: true,
  overrides: [{ files: ["**/*.astro"], customSyntax: "postcss-html" }],
  rules: Object.fromEntries(plugins.map((p) => [p.ruleName, true])),
};
