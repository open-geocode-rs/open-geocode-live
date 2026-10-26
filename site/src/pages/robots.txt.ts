import type { APIRoute } from "astro";

// AI crawlers are named, not left to `*`: many hosts block them by default, and
// this site wants to be read and cited by them.
const AGENTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
];

export const GET: APIRoute = ({ site }) => {
  const groups = ["*", ...AGENTS].map((agent) => `User-agent: ${agent}\nAllow: /`).join("\n\n");
  const sitemap = new URL("sitemap-index.xml", site).href;
  return new Response(`${groups}\n\nSitemap: ${sitemap}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
