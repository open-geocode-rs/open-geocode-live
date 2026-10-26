import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightOpenAPI, { openAPISidebarGroups } from "starlight-openapi";

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
      logo: {
        light: "./src/assets/logo-light.png",
        dark: "./src/assets/logo-dark.png",
        alt: "open-geocode",
        replacesTitle: true,
      },
      favicon: "/favicon.png",
      head: [{ tag: "link", attrs: { rel: "apple-touch-icon", href: "/apple-touch-icon.png" } }],
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/open-geocode-rs/open-geocode" },
      ],
      editLink: { baseUrl: "https://github.com/open-geocode-rs/open-geocode-live/edit/main/site/" },
      lastUpdated: true,
      customCss: ["./src/styles/fonts.css", "./src/styles/starlight.css"],
      plugins: [
        starlightOpenAPI([
          {
            base: "docs/api",
            schema: "./public/openapi.json",
            sidebar: { label: "API reference", collapsed: false, operations: { badges: true } },
          },
        ]),
      ],
      sidebar: [
        { label: "Start here", items: ["docs", "docs/quickstart"] },
        {
          label: "Guides",
          items: ["docs/guides/build-a-pack", "docs/guides/serve", "docs/guides/batch-csv"],
        },
        { label: "Reference", items: ["docs/responses", "docs/benchmarks", "docs/compare"] },
        ...openAPISidebarGroups,
      ],
    }),
  ],
});
