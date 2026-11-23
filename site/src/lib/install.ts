import type { ExamplePanel } from "../components/prose/CodeTabs.astro";

export const releaseLabel = "v1.0.0";
const releases = "https://github.com/open-geocode-rs/open-geocode/releases";
export const releaseUrl = `${releases}/tag/${releaseLabel}`;

export const installPanels: ExamplePanel[] = [
  {
    id: "unix",
    label: "macOS & Linux",
    block: { kind: "code", lang: "bash", code: "curl -fsSL https://opengeocode.com/install | bash" },
  },
  {
    id: "windows",
    label: "Windows",
    block: {
      kind: "code",
      lang: "powershell",
      code: 'powershell -c "irm https://opengeocode.com/install.ps1|iex"',
    },
  },
];
