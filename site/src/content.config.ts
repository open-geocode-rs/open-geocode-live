import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { defineCollection } from "astro:content";

export const collections = {
  docs: defineCollection({
    loader: docsLoader({
      // Docs live under /docs so / stays the landing page.
      generateId: ({ entry }) => {
        const path = entry.replace(/\.mdx?$/, "").replace(/(^|\/)index$/, "");
        return path ? `docs/${path}` : "docs";
      },
    }),
    schema: docsSchema(),
  }),
};
