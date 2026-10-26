import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// example.com, like every other placeholder in this repo, until the domain is picked.
const site = process.env.SITE_URL ?? "https://example.com";

const description =
  "Self-hosted address geocoding in pure Rust: forward, autocomplete, reverse and batch, " +
  "served from one memory-mapped file built from OpenStreetMap and OpenAddresses.";

export default defineConfig({
  site,
  trailingSlash: "ignore",
  integrations: [
    starlight({
      title: "open-geocode",
      description,
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/open-geocode-rs/open-geocode" },
      ],
      editLink: { baseUrl: "https://github.com/open-geocode-rs/open-geocode-live/edit/main/site/" },
      lastUpdated: true,
      sidebar: [
        { label: "Start here", items: ["docs", "docs/quickstart"] },
        {
          label: "Guides",
          items: ["docs/guides/build-a-pack", "docs/guides/serve", "docs/guides/batch-csv"],
        },
        { label: "Reference", items: ["docs/responses", "docs/benchmarks", "docs/compare"] },
      ],
    }),
  ],
});
