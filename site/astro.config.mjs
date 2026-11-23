import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import { defineConfig, fontProviders } from "astro/config";
import starlightLlmsTxt from "starlight-llms-txt";
import { apiSidebarGroup } from "./src/lib/openapi.ts";

const site = process.env.SITE_URL ?? "https://opengeocode.com";

const description =
  "OpenGeocode is free, open-source, self-hosted address geocoding in pure Rust: forward, autocomplete, reverse and " +
  "batch, served from one memory-mapped file built from OpenStreetMap and OpenAddresses.";

// Dev only: OG_API is a runtime to send address lookups to, e.g. an SSH tunnel to the VM.
const api = process.env.OG_API;

export default defineConfig({
  site,
  trailingSlash: "ignore",
  vite: {
    optimizeDeps: { include: ["@mapbox/vector-tile", "pbf"] },
    server: {
      proxy: api ? {
        "^/api/(autocomplete|geocode|places|reverse)(?:[?]|$)": { target: api, bypass: (request) => request.method === "GET" ? undefined : false, rewrite: (path) => path.replace(/^\/api/, "") },
        "^/api/try/(geocode|places|reverse)(?:[?]|$)": { target: api, bypass: (request) => request.method === "GET" ? undefined : false, rewrite: (path) => path.replace(/^\/api\/try/, "") },
      } : undefined,
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
    // Listed here so the system page, a page for the people building the site, stays out of the sitemap.
    sitemap({ filter: (page) => new URL(page).pathname !== "/system/" }),
    starlight({
      title: "OpenGeocode",
      description,
      // The site draws its own 404 page in src/pages/404.astro, through the docs frame.
      disable404Route: true,
      logo: {
        light: "./src/assets/logo-light.png",
        dark: "./src/assets/logo-dark.png",
        alt: "OpenGeocode",
        replacesTitle: true,
      },
      // The SVG follows the browser's theme. The PNG is for browsers that cannot show an SVG icon.
      favicon: "/favicon.svg",
      head: [
        { tag: "link", attrs: { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "96x96" } },
        { tag: "link", attrs: { rel: "apple-touch-icon", href: "/apple-touch-icon.png" } },
        // Starlight emits twitter:card summary_large_image but no image, so previews came up blank.
        { tag: "meta", attrs: { property: "og:image", content: `${site}/og.png` } },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        { tag: "meta", attrs: { property: "og:image:alt", content: "OpenGeocode logo: fast, lightweight, self-hosted geocoding engine in pure Rust." } },
      ],
      editLink: { baseUrl: "https://github.com/open-geocode-rs/open-geocode-live/edit/main/site/" },
      lastUpdated: true,
      customCss: [
        "./src/styles/tokens/primitives.css",
        "./src/styles/tokens/roles.css",
        "./src/styles/tokens/components.css",
        "./src/styles/tokens/host.css",
        "./src/styles/global.css",
      ],
      // The docs frame is our own components. The frame keeps its routing, page data, content and scripts.
      components: {
        Head: "./src/components/frame/DocsHead.astro",
        PageFrame: "./src/components/frame/PageFrame.astro",
        Header: "./src/components/frame/Header.astro",
        Sidebar: "./src/components/frame/Sidebar.astro",
        TwoColumnContent: "./src/components/frame/TwoColumnContent.astro",
        PageSidebar: "./src/components/frame/PageSidebar.astro",
        ContentPanel: "./src/components/frame/ContentPanel.astro",
        PageTitle: "./src/components/frame/PageTitle.astro",
        Footer: "./src/components/frame/Footer.astro",
        MarkdownContent: "./src/components/MarkdownContent.astro",
      },
      plugins: [
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
        { label: "Start here", items: ["docs", "docs/quickstart", "docs/installation"] },
        {
          label: "Guides",
          items: ["docs/guides/download-packs", "docs/guides/build-a-pack", "docs/guides/serve", "docs/guides/batch-csv", "docs/guides/typescript"],
        },
        {
          label: "Compatibility",
          items: [
            { label: "Overview", slug: "docs/compatibility" },
            "docs/compatibility/google",
            "docs/compatibility/mapbox",
            "docs/compatibility/here",
            "docs/compatibility/precisely",
          ],
        },
        { label: "Reference", items: ["docs/responses", "docs/benchmarks"] },
        // The API reference pages are our own, made from the OpenAPI document in public/.
        apiSidebarGroup("API reference"),
      ],
    }),
  ],
});
