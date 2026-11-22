import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";
import { mdxToMdast, type MdastNode } from "satteri";

function plainMarkdown(body: string): string {
  const root = mdxToMdast(body);
  if (root.type !== "root") return body;

  // Source ranges preserve fences, tables and links without reserializing Markdown.
  function render(nodes: MdastNode[], start: number, end: number, depth: number): string {
    let output = "";
    let cursor = start;
    for (const node of nodes) {
      const from = node.position?.start.offset;
      const to = node.position?.end.offset;
      if (from === undefined || to === undefined) continue;
      output += body.slice(cursor, from);
      if (node.type === "heading") depth = node.depth;
      if (node.type === "mdxJsxFlowElement" && node.name === "Tabs") {
        const items = node.children.map((item) => {
          if (item.type !== "mdxJsxFlowElement" || item.name !== "TabItem") return "";
          const label = item.attributes.find((attribute) => attribute.type === "mdxJsxAttribute" && attribute.name === "label")?.value;
          const first = item.children[0]?.position?.start.offset;
          const last = item.children.at(-1)?.position?.end.offset;
          const level = Math.min(depth + 1, 6);
          const content = first === undefined || last === undefined ? "" : render(item.children, first, last, level);
          return typeof label === "string" ? `${"#".repeat(level)} ${label}\n\n${content}` : content;
        });
        output += items.join("\n\n");
      } else if (node.type !== "mdxjsEsm") {
        output += body.slice(from, to);
      }
      cursor = to;
    }
    return output + body.slice(cursor, end);
  }

  return render(root.children, 0, body.length, 1).trimStart();
}

export const getStaticPaths = (async () => {
  const docs = await getCollection("docs");
  return docs.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ entry: CollectionEntry<"docs"> }> = ({ props }) => {
  const { title, description } = props.entry.data;
  const lede = description ? `> ${description}\n\n` : "";
  const body = props.entry.body ?? "";
  const markdown = props.entry.filePath?.endsWith(".mdx") ? plainMarkdown(body) : body;
  return new Response(`# ${title}\n\n${lede}${markdown}`, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};
