// The og/scripts rule for oxlint. oxlint reads script files and the frontmatter and script blocks of Astro files, and
// maps the lines of each block back to its file. The markup of Astro files is checked by lint/markup.mjs.
import { scriptVisitors } from "./rules.mjs";

/** The initialiser of the const that `id` names where `node` sits, read from the scope oxlint built. */
function constInit(context, node, id) {
  let scope = context.sourceCode.getScope(node);
  while (scope) {
    const v = scope.set.get(id.name);
    if (v) {
      const def = v.defs[0];
      return def?.type === "Variable" && def.parent.kind === "const" ? def.node.init : undefined;
    }
    scope = scope.upper;
  }
  return undefined;
}

const scripts = {
  meta: { type: "problem", schema: [] },
  create(context) {
    return scriptVisitors({
      file: context.filename.split("\\").join("/"),
      say: (node, message) => context.report({ node, message }),
      constInit: (node, id) => constInit(context, node, id),
    });
  },
};

export default {
  meta: { name: "og" },
  rules: { scripts },
};
