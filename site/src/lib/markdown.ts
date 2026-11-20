// The descriptions in the OpenAPI document are Markdown. They render here once at build time, and become the
// same prose parts as the docs pages, so a link or a list in a description looks as it does anywhere else.
import { createSatteriMarkdownProcessor } from "@astrojs/markdown-satteri";
import { capitalize } from "./openapi";
import { proseOf, type ProseNode } from "./prose";

const processor = await createSatteriMarkdownProcessor();

export async function markdownProse(text: string): Promise<ProseNode[]> {
  const { code } = await processor.render(capitalize(text));
  return proseOf(code);
}
