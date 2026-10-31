import starlight from "@astrojs/starlight";
import { defineConfig, fontProviders } from "astro/config";
import starlightLlmsTxt from "starlight-llms-txt";
import starlightOpenAPI, { openAPISidebarGroups } from "starlight-openapi";

// example.com, like every other placeholder in this repo, until the domain is picked.
const site = process.env.SITE_URL ?? "https://example.com";

const description =
  "OpenGeocode is free, open-source, self-hosted address geocoding in pure Rust: forward, autocomplete, reverse and " +
  "batch, served from one memory-mapped file built from OpenStreetMap and OpenAddresses.";

// Dev only: OG_API is a runtime to send /api/search to, e.g. an SSH tunnel to the VM.
const api = process.env.OG_API;

export default defineConfig({
  site,
  trailingSlash: "ignore",
  vite: {
    server: {
      proxy: api ? { "/api/search": { target: api, rewrite: (path) => path.replace(/^\/api/, "") } } : undefined,
    },
  },
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Archivo Narrow",
      cssVariable: "--font-display",
      // Variable axis, so weight can be tuned continuously (display uses 550).
      weights: ["400 700"],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["system-ui", "sans-serif"],
    },
    {
      provider: fontProviders.google(),
      name: "Inter",
      cssVariable: "--font-body",
      weights: ["100 900"],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["system-ui", "sans-serif"],
    },
  ],
  integrations: [
    starlight({
      title: "OpenGeocode",
      description,
      logo: {
        light: "./src/assets/logo-light.png",
        dark: "./src/assets/logo-dark.png",
        alt: "OpenGeocode",
        replacesTitle: true,
      },
      favicon: "/favicon.png",
      head: [
        { tag: "link", attrs: { rel: "apple-touch-icon", href: "/apple-touch-icon.png" } },
        // Starlight emits twitter:card summary_large_image but no image, so previews came up blank.
        { tag: "meta", attrs: { property: "og:image", content: `${site}/og.png` } },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        { tag: "meta", attrs: { property: "og:image:alt", content: "OpenGeocode logo: fast, lightweight, self-hosted geocoding engine in pure Rust." } },
      ],
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/open-geocode-rs/open-geocode" },
      ],
      editLink: { baseUrl: "https://github.com/open-geocode-rs/open-geocode-live/edit/main/site/" },
      lastUpdated: true,
      customCss: ["./src/styles/type.css", "./src/styles/starlight.css", "./src/styles/layout.css", "./src/styles/api.css", "./src/styles/search.css"],
      components: {
        Head: "./src/components/DocsHead.astro",
        Header: "./src/components/Header.astro",
        PageTitle: "./src/components/PageTitle.astro",
        MarkdownContent: "./src/components/MarkdownContent.astro",
        ThemeSelect: "./src/components/ThemeSelect.astro",
        Pagination: "./src/components/Pagination.astro",
      },
      routeMiddleware: "./src/routeData.ts",
      plugins: [
        starlightOpenAPI([
          {
            base: "docs/api",
            schema: "./public/openapi.json",
            sidebar: { label: "API reference", collapsed: false, operations: { badges: true } },
          },
        ]),
        starlightLlmsTxt({
          projectName: "OpenGeocode",
          description,
          details: [
            "- Also known as open-geocode (the crate, repository and batch binary) and og (the CLI).",
            "- Two binaries: `og` builds a Pack for a region and serves it; `open-geocode` adds batch CSV geocoding, benchmarks and lower-level Pack tools.",
            "- A Pack is one file. The HTTP API is GET-only and answers GeoJSON FeatureCollections; errors are RFC 9457 problem documents.",
            "- The machine-readable contract is the OpenAPI 3.1 document at /openapi.json.",
          ].join("\n"),
          optionalLinks: [
            { label: "OpenAPI document", url: `${site}/openapi.json`, description: "The HTTP API contract." },
            { label: "Source", url: "https://github.com/open-geocode-rs/open-geocode" },
          ],
        }),
      ],
      sidebar: [
        { label: "Start here", items: ["docs", "docs/quickstart"] },
        {
          label: "Guides",
          items: ["docs/guides/build-a-pack", "docs/guides/serve", "docs/guides/batch-csv"],
        },
        { label: "Reference", items: ["docs/responses", "docs/benchmarks"] },
        ...openAPISidebarGroups,
      ],
    }),
  ],
});
