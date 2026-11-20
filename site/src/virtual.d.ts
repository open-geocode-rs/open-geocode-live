// The docs frame's search setting, as the frame hands it to the page.
declare module "virtual:starlight/pagefind-config" {
  export const pagefindUserConfig: { ranking?: Record<string, number> };
}
