import type { APIRoute, GetStaticPaths } from "astro";
import { getCollection, type CollectionEntry } from "astro:content";

// Every docs page again as plain Markdown at <page>.md, for agents. Pages are .md,
// not .mdx, so the body has no components to strip.
export const getStaticPaths = (async () => {
  const docs = await getCollection("docs");
  return docs.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<{ entry: CollectionEntry<"docs"> }> = ({ props }) => {
  const { title, description } = props.entry.data;
  const lede = description ? `> ${description}\n\n` : "";
  return new Response(`# ${title}\n\n${lede}${props.entry.body ?? ""}`, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
};
