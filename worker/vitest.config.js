import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

// Run tests inside workerd (the real Workers runtime), reading the same
// wrangler.toml the Worker deploys with.
export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
      },
    },
  },
});
