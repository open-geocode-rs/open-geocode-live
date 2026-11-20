import { docsLoader, i18nLoader } from "@astrojs/starlight/loaders";
import { docsSchema, i18nSchema } from "@astrojs/starlight/schema";
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
  // The docs frame reads its interface words from this collection. The site keeps the frame's English as it is, so the
  // English file sets no word of its own.
  i18n: defineCollection({ loader: i18nLoader(), schema: i18nSchema() }),
};
